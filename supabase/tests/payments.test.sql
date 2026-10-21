-- pgTAP: RLS, server-side price, approval idempotency, stacking, expiry.
-- Run: npx supabase test db   (Supabase CLI, local stack)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(30);

select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity)::int, 0,
  'RLS enabled on every public table');

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'viewer@test.mn', 'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'other@test.mn',  'authenticated', 'authenticated');

create or replace function pg_temp.as_user(p uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
create or replace function pg_temp.as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
end $$;
create or replace function pg_temp.as_service() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  execute 'set local role service_role';
end $$;
create or replace function pg_temp.as_postgres() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-------------------------------------------------------------------------------
-- 1. Access control
-------------------------------------------------------------------------------
select is((select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'viewer', 'profile created on sign-up');

select pg_temp.as_anon();
select is((select count(*) from public.products)::int, 3, 'anon sees the three passes');
select throws_ok($$ select * from public.payment_requests $$, '42501', null, 'anon cannot read payment requests');
select throws_ok($$ select public.create_payment_request('kino_1m') $$, '28000', 'not_authenticated', 'anon cannot create a request');

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.my_access_until(), null, 'no access before paying');
select throws_ok($$ insert into public.subscriptions (user_id, starts_at, expires_at) values (auth.uid(), now(), now() + interval '1 year') $$,
  '42501', null, 'user cannot grant themselves a subscription');
select throws_ok($$ update public.payment_requests set status = 'approved' $$, '42501', null, 'user cannot change request status');
select throws_ok($$ update public.products set price_mnt = 1 $$, '42501', null, 'user cannot change prices');
select lives_ok($$ update public.profiles set display_name = 'Бат' where id = auth.uid() $$, 'user can rename themselves');

-------------------------------------------------------------------------------
-- 2. Requests: server-side price, reference, limits
-------------------------------------------------------------------------------
create temp table pr1 as select * from public.create_payment_request('kino_1m');
create temp table pr3 as select * from public.create_payment_request('kino_3m');
create temp table pr12 as select * from public.create_payment_request('kino_12m');
grant select on pr1, pr3, pr12 to authenticated, service_role;
select is((select amount_mnt from pr1), 9900, 'price taken from products');
select matches((select ref_code from pr1), '^KT-[0-9]{4,}$', 'reference code KT-1234');
select throws_ok($$ select public.create_payment_request('kino_1m') $$, 'P0001', 'too_many_open', 'max 3 open requests');
select throws_ok($$ select public.create_payment_request('nope') $$, 'P0002', 'product_not_found', 'unknown product');
select throws_ok($$ select public.approve_payment((select id from pr1)) $$, '42501', null, 'user cannot approve');

select is((public.submit_payment_request((select id from pr1)) ->> 'needs_notify'), 'true', 'submit → notify admin');
select is((public.submit_payment_request((select id from pr1)) ->> 'needs_notify'), 'true', 'resubmit before Telegram message saved → notify again');
select public.submit_payment_request((select id from pr3));

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000002');
select is((select count(*) from public.payment_requests)::int, 0, 'other user sees none of these requests');
select throws_ok($$ select public.submit_payment_request((select id from pr1)) $$, 'P0002', 'not_found', 'other user cannot submit it');

-------------------------------------------------------------------------------
-- 3. Approval (service role = Telegram webhook): once, stacking
-------------------------------------------------------------------------------
select pg_temp.as_service();
select is((public.approve_payment((select id from pr12), 7) ->> 'ok'), 'false', 'cannot approve before "Гүйлгээ хийсэн"');
select is((public.approve_payment((select id from pr1), 7) ->> 'already'), 'false', 'approve 1 month');
select is((public.approve_payment((select id from pr1), 7) ->> 'already'), 'true', 'double approve is a no-op');
select is((select count(*) from public.subscriptions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001')::int, 1, 'one subscription after double approve');
select is((public.approve_payment((select id from pr3), 7) ->> 'status'), 'approved', 'approve 3 months');
select is(
  (select max(expires_at) - min(starts_at) from public.subscriptions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001')::text,
  '120 days', '3 months extend from the current expiry (30 + 90)');

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select ok(public.my_access_until() > now() + interval '119 days', 'my_access_until is the end of the stacked passes');

-------------------------------------------------------------------------------
-- 4. Rejection with reason; expiry
-------------------------------------------------------------------------------
select public.submit_payment_request((select id from pr12));
select pg_temp.as_service();
select is((public.reject_payment((select id from pr12), 7) ->> 'status'), 'rejected', 'reject');
select ok(public.set_payment_reject_reason((select id from pr12), 'Дүн зөрүүтэй'), 'reason from Telegram reply saved');
select is((public.approve_payment((select id from pr12), 7) ->> 'ok'), 'false', 'rejected request cannot be approved');

select pg_temp.as_postgres();
update public.subscriptions set starts_at = now() - interval '200 days', expires_at = now() - interval '1 second'
 where user_id = 'aaaaaaaa-0000-4000-8000-000000000001';
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is(public.my_access_until(), null, 'expired passes give no access');

select * from finish();
rollback;
