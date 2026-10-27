-- pgTAP: RLS, серверийн үнэ, батлалт нэг удаа, сунгалт, түрээс, админ, хаалт.
-- Ажиллуулах: npx supabase test db   (Supabase CLI, локал орчин)
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(56);

select is(
  (select count(*) from pg_tables where schemaname = 'public' and not rowsecurity)::int, 0,
  'RLS enabled on every public table');
select ok(has_table_privilege('service_role', 'public.payment_requests', 'select, update'),
  'server (service_role) can read and update payment requests');

insert into auth.users (id, email, aud, role) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'viewer@test.mn',       'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'other@test.mn',        'authenticated', 'authenticated'),
  ('aaaaaaaa-0000-4000-8000-000000000003', 'KinoTubeMN@gmail.com', 'authenticated', 'authenticated');

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
-- 1. Профайл, эзэмшигч админ, хандалт
-------------------------------------------------------------------------------
select is((select display_name from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'viewer', 'profile created on sign-up');
select ok((select is_admin from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000003'), 'owner email becomes admin');
select ok(not (select is_admin from public.profiles where id = 'aaaaaaaa-0000-4000-8000-000000000001'), 'others are not admin');

select pg_temp.as_anon();
select is((select count(*) from public.products)::int, 2, 'anon sees the two products');
select throws_ok($$ select * from public.payment_requests $$, '42501', null, 'anon cannot read payment requests');

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is((public.me() ->> 'subscription_until'), null, 'no access before paying');
select throws_ok($$ insert into public.subscriptions (user_id, starts_at, expires_at, source) values (auth.uid(), now(), now() + interval '1 year', 'admin') $$,
  '42501', null, 'user cannot grant themselves a subscription');
select throws_ok($$ update public.profiles set is_admin = true where id = auth.uid() $$, '42501', null, 'user cannot make themselves admin');
select throws_ok($$ update public.products set price_mnt = 1 $$, '42501', null, 'user cannot change prices');
select lives_ok($$ update public.profiles set display_name = 'Бат' where id = auth.uid() $$, 'user can rename themselves');
select is((public.me() ->> 'name'), 'Бат', 'me() returns the new name');
select throws_ok($$ select public.admin_list_users() $$, '42501', 'forbidden', 'user cannot list users');
select throws_ok($$ select public.admin_grant('aaaaaaaa-0000-4000-8000-000000000001', 30) $$, '42501', 'forbidden', 'user cannot grant');

-------------------------------------------------------------------------------
-- 2. Хүсэлт: серверийн үнэ, KT код, давхардал, хязгаар
-------------------------------------------------------------------------------
create temp table pm as select * from public.create_payment_request('month');
create temp table pr as select * from public.create_payment_request('rent', 'metropolis', 'Метрополис');
grant select on pm, pr to authenticated, service_role;
select is((select amount_mnt from pm), 15900, 'month price from products');
select is((select amount_mnt from pr), 4900, 'rent price from products');
select matches((select ref_code from pm), '^KT-[0-9]{4,}$', 'reference code KT-1234');
select is((select id from public.create_payment_request('month')), (select id from pm), 'same open request is reused');
select throws_ok($$ select public.create_payment_request('rent') $$, '22023', 'movie_required', 'rent needs a movie');
select throws_ok($$ select public.create_payment_request('gold') $$, 'P0002', 'product_not_found', 'unknown product');
-- Админ тохируулсан киноны үнэ (catalog.price_mnt) products-ийн үнийг давна.
select pg_temp.as_postgres();
update public.catalog set price_mnt = 9900 where id = 'nosferatu';
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is((select amount_mnt from public.create_payment_request('rent', 'nosferatu', 'Носферату')), 9900, 'rent uses the movie price (third open request allowed)');
select pg_temp.as_postgres();
update public.catalog set price_mnt = 12900 where id = 'nosferatu';
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select is((select amount_mnt from public.create_payment_request('rent', 'nosferatu', 'Носферату')), 12900, 'unsent request follows a new price');
select throws_ok($$ select public.create_payment_request('rent', 'the-general', 'Генерал') $$, 'P0001', 'too_many_open', 'max 3 open requests');
select throws_ok($$ select public.approve_payment((select id from pm)) $$, '42501', 'forbidden', 'user cannot approve');

select is((public.submit_payment_request((select id from pm)) ->> 'needs_notify'), 'true', 'submit → notify admin');
select public.submit_payment_request((select id from pr));

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000002');
select is((select count(*) from public.payment_requests)::int, 0, 'other user sees none of these requests');
select throws_ok($$ select public.submit_payment_request((select id from pm)) $$, 'P0002', 'not_found', 'other user cannot submit it');

-------------------------------------------------------------------------------
-- 3. Батлах (Telegram = service role): нэг удаа, сунгалт, түрээс
-------------------------------------------------------------------------------
select pg_temp.as_service();
select is((public.approve_payment((select id from pm), 7) ->> 'already'), 'false', 'approve month');
select is((public.approve_payment((select id from pm), 7) ->> 'already'), 'true', 'double approve is a no-op');
select is((select count(*) from public.subscriptions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001')::int, 1, 'one subscription after double approve');
select is((public.approve_payment((select id from pr), 7) ->> 'status'), 'approved', 'approve rental');
select ok(public.can_watch('aaaaaaaa-0000-4000-8000-000000000001', 'any-movie'), 'month pass opens every movie');
select ok(not public.can_watch('aaaaaaaa-0000-4000-8000-000000000002', 'metropolis'), 'other user cannot watch');

select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select ok((public.me() ->> 'subscription_until')::timestamptz > now() + interval '27 days', 'me(): month pass active');
select is(jsonb_array_length(public.me() -> 'rentals'), 1, 'me(): one rental');
select is((public.me() -> 'rentals' -> 0 ->> 'id'), 'metropolis', 'me(): rental movie id');
create temp table pm2 as select * from public.create_payment_request('month');
grant select on pm2 to service_role;
select public.submit_payment_request((select id from pm2));
select pg_temp.as_service();
select public.approve_payment((select id from pm2), 7);
select ok(
  (select max(expires_at) - min(starts_at) from public.subscriptions where user_id = 'aaaaaaaa-0000-4000-8000-000000000001')
    between interval '56 days' and interval '62 days',
  'second month extends from the current expiry');

-------------------------------------------------------------------------------
-- 4. Татгалзах, шалтгаан
-------------------------------------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000002');
create temp table pr2 as select * from public.create_payment_request('rent', 'nosferatu', 'Носферату');
grant select on pr2 to service_role;
select public.submit_payment_request((select id from pr2));
select pg_temp.as_service();
select is((public.reject_payment((select id from pr2), 7) ->> 'status'), 'rejected', 'reject');
select ok(public.set_payment_reject_reason((select id from pr2), 'Дүн зөрүүтэй'), 'reason from Telegram reply saved');
select is((public.approve_payment((select id from pr2), 7) ->> 'ok'), 'false', 'rejected request cannot be approved');
select ok(not public.can_watch('aaaaaaaa-0000-4000-8000-000000000002', 'nosferatu'), 'rejected rental gives no access');

-------------------------------------------------------------------------------
-- 5. Админ: жагсаалт, эрх олгох, тасалгах, хаах, үзэлт, тоо
-------------------------------------------------------------------------------
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000003');
select is((select count(*) from public.admin_list_users())::int, 3, 'admin lists all users');
select is((public.admin_find_user('OTHER@test.mn') ->> 'email'), 'other@test.mn', 'admin finds user by email, any case');
select ok((public.admin_grant('aaaaaaaa-0000-4000-8000-000000000002', 7) ->> 'subscription_until')::timestamptz > now() + interval '6 days', 'admin grants 7 days');
select pg_temp.as_service();
select ok(public.can_watch('aaaaaaaa-0000-4000-8000-000000000002', 'x'), 'granted user can watch');
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000003');
select is((public.admin_set_end('aaaaaaaa-0000-4000-8000-000000000002', now() + interval '2 days') ->> 'subscription_until')::timestamptz,
          now() + interval '2 days', 'admin sets the end date');
select is((public.admin_cancel('aaaaaaaa-0000-4000-8000-000000000002') ->> 'subscription_until'), null, 'admin cancels');
select is((select count(*) from public.admin_list_payments('submitted'))::int, 0, 'no pending payments left');
-- PostgREST stable функцийг read-only ажиллуулдаг: бичдэг функц volatile байх ёстой.
select is((select provolatile::text from pg_proc where oid = 'public.admin_list_payments(text)'::regprocedure), 'v', 'admin_list_payments is volatile (it expires requests)');
select ok((public.admin_stats() ->> 'all_month')::int = 31800 and (public.admin_stats() ->> 'all_rent')::int = 4900, 'stats sum approved payments');
select throws_ok($$ select public.admin_set_blocked('aaaaaaaa-0000-4000-8000-000000000003', true) $$, '42501', 'forbidden', 'admin cannot block themselves');
select is((public.admin_set_blocked('aaaaaaaa-0000-4000-8000-000000000001', true) ->> 'blocked'), 'true', 'admin blocks a user');

select pg_temp.as_service();
select ok(not public.can_watch('aaaaaaaa-0000-4000-8000-000000000001', 'metropolis'), 'blocked user cannot watch even with a pass');
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000001');
select throws_ok($$ select public.create_payment_request('month') $$, '42501', 'blocked', 'blocked user cannot pay');
select public.record_view('metropolis', false);
select public.record_view('metropolis', true);
select pg_temp.as_user('aaaaaaaa-0000-4000-8000-000000000003');
select is((select (x ->> 'count')::int from public.admin_views() x where x ->> 'movie_id' = 'metropolis'), 1, 'views counted once per user');

select * from finish();
rollback;
