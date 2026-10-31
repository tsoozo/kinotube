-- pgTAP: утас + 4 оронтой кодоор нэвтрэх. Кодыг зөвхөн сервер шалгана, далд имэйл UI-д харагдахгүй.
-- Ажиллуулах: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

insert into auth.users (id, email, aud, role) values
  ('cccccccc-0000-4000-8000-000000000001', 'u-0123456789abcdef01234567@kinotube.pages.dev', 'authenticated', 'authenticated'),
  ('cccccccc-0000-4000-8000-000000000002', 'old@test.mn',          'authenticated', 'authenticated'),
  ('cccccccc-0000-4000-8000-000000000003', 'kinotubemn@gmail.com', 'authenticated', 'authenticated');

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

select is((select display_name from public.profiles where id = 'cccccccc-0000-4000-8000-000000000001'), null,
          'hidden email does not become a display name');

-- Сервер: бүртгэх, шалгах.
select pg_temp.as_service();
select lives_ok($$ select public.pin_register('cccccccc-0000-4000-8000-000000000001', '99112233', '1234') $$, 'service registers phone + pin');
select is(public.pin_user_by_phone('99112233'), 'cccccccc-0000-4000-8000-000000000001'::uuid, 'phone lookup');
select is(public.pin_login_user('99112233', '1234'), 'cccccccc-0000-4000-8000-000000000001'::uuid, 'correct pin logs in');
select is(public.pin_login_user('99112233', '1235'), null, 'wrong pin rejected');
select is(public.pin_login_user('88112233', '1234'), null, 'unknown phone rejected');
select throws_ok($$ select public.pin_register('cccccccc-0000-4000-8000-000000000002', '99112233', '1111') $$,
                 '23505', 'phone_taken', 'phone cannot be reused');
select throws_ok($$ select public.pin_register('cccccccc-0000-4000-8000-000000000002', '9911', '1111') $$,
                 '22023', 'invalid_phone', 'phone must be 8 digits');
select throws_ok($$ select public.pin_register('cccccccc-0000-4000-8000-000000000002', '88112233', '12a4') $$,
                 '22023', 'invalid_pin', 'pin must be 4 digits');
select is(public.user_contact('cccccccc-0000-4000-8000-000000000001'), '99112233', 'contact is the phone');
select is(public.user_contact('cccccccc-0000-4000-8000-000000000002'), 'old@test.mn', 'legacy contact is the email');
reset role;

-- Хэрэглэгч/зочин серверийн функцийг дуудаж чадахгүй (кодыг таах боломжгүй).
select pg_temp.as_anon();
select throws_ok($$ select public.pin_login_user('99112233', '1234') $$, '42501', null, 'anon cannot check pins');
reset role;
select pg_temp.as_user('cccccccc-0000-4000-8000-000000000002');
select throws_ok($$ select public.pin_login_user('99112233', '1234') $$, '42501', null, 'users cannot check pins');
select throws_ok($$ select * from private.pin_logins $$, '42501', null, 'pin hashes are private');

-- me(): далд имэйл нуугдаж, дугаар харагдана.
reset role;
select pg_temp.as_user('cccccccc-0000-4000-8000-000000000001');
select is(public.me() ->> 'email', null, 'hidden email not exposed');
select is(public.me() ->> 'phone', '99112233', 'me has phone');

-- Хуучин имэйл хэрэглэгч дугаар, код нэмнэ.
reset role;
select pg_temp.as_user('cccccccc-0000-4000-8000-000000000002');
select lives_ok($$ select public.set_my_pin('88112233', '4321') $$, 'legacy user sets phone + pin');
select throws_ok($$ select public.set_my_pin('99112233', '4321') $$, '23505', 'phone_taken', 'cannot take another phone');
select throws_ok($$ select public.admin_set_pin('cccccccc-0000-4000-8000-000000000001', null, '0000') $$,
                 '42501', 'forbidden', 'non-admin cannot reset pins');

-- Админ: кодоо мартсан хэрэглэгчид шинэ код, дугаараар хайх.
reset role;
select pg_temp.as_user('cccccccc-0000-4000-8000-000000000003');
select is((public.admin_set_pin('cccccccc-0000-4000-8000-000000000001', null, '0000')) ->> 'phone', '99112233', 'admin resets pin, phone kept');
select is((public.admin_find_user('88112233')) ->> 'id', 'cccccccc-0000-4000-8000-000000000002', 'admin finds user by phone');

reset role;
select pg_temp.as_service();
select is(public.pin_login_user('99112233', '0000'), 'cccccccc-0000-4000-8000-000000000001'::uuid, 'new pin works after reset');

select * from finish();
rollback;
