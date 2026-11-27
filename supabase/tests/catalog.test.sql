-- pgTAP: кино/цувралын жагсаалт (catalog): нийтлээгүйг нуух, зөвхөн админ засах, видеоны төлөвийг сервер л өөрчилнө.
-- Ажиллуулах: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(34);

insert into auth.users (id, email, aud, role) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'viewer@test.mn',       'authenticated', 'authenticated'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'kinotubemn@gmail.com', 'authenticated', 'authenticated');

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

select ok((select count(*) from public.catalog where kind = 'movie') >= 10, 'sample movies seeded');
select ok((select bool_and(published) from public.catalog), 'seeded rows are published');

-- Админ: кино нэмэх (ноорог), засах.
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000003');
select is((public.admin_save_catalog('{"id":"draft-film","kind":"movie","title":"Ноорог","year":"2024","genres":["Драм"," "],"duration":"1:30:00","added":"2026-10-27","published":false}')).title,
          'Ноорог', 'admin saves a draft');
select is((select genres from public.catalog where id = 'draft-film'), array['Драм'], 'blank genres dropped');
select is((select added from public.catalog where id = 'draft-film'), '2026-10-27'::date, 'added date kept');
select is((public.admin_save_catalog('{"id":"draft-film","kind":"movie","title":"Ноорог 2","published":false}')).title,
          'Ноорог 2', 'admin edits the same id');
select is((select count(*) from public.catalog where id = 'draft-film')::int, 1, 'edit does not duplicate');
select throws_ok($$ select public.admin_save_catalog('{"id":"draft-film","kind":"series","title":"x"}') $$,
                 '22023', 'kind_mismatch', 'kind cannot change');
select throws_ok($$ select public.admin_save_catalog('{"id":"Bad Id","kind":"movie","title":"x"}') $$,
                 '23514', null, 'invalid id rejected');
-- Ангилал: зөвхөн тогтсон түлхүүрүүд, давхардалгүй; цувралд ч ангилал байна.
select is((public.admin_save_catalog('{"id":"draft-film","kind":"movie","title":"Ноорог 2","categories":["korean","old","korean"],"published":false}')).categories,
          array['korean','old'], 'categories saved, deduped');
select throws_ok($$ select public.admin_save_catalog('{"id":"draft-film","kind":"movie","title":"x","categories":["usa"]}') $$,
                 '23514', null, 'unknown category rejected');
select is((public.admin_save_catalog('{"id":"draft-series","kind":"series","orientation":"vertical","title":"x","categories":["ai"]}')).categories,
          array['ai'], 'series have categories');
select is((public.admin_save_catalog('{"id":"draft-film","kind":"movie","title":"Ноорог 2","categories":["russian"],"published":false}')).categories,
          array['russian'], 'russian category allowed');
select is((select orientation from public.catalog where id = 'draft-series'), 'vertical', 'orientation saved');
select throws_ok($$ select public.admin_save_catalog('{"id":"bad-short","kind":"short","title":"x"}') $$,
                 '23514', null, 'old short kind rejected');
-- Үнэ: кино, цуврал бүрт, хоосон бол null (үндсэн үнэ).
select is((public.admin_save_catalog('{"id":"draft-film","kind":"movie","title":"Ноорог 2","price_mnt":9900,"published":false}')).price_mnt,
          9900, 'movie price saved');
select is((public.admin_save_catalog('{"id":"draft-film","kind":"movie","title":"Ноорог 2","price_mnt":null,"published":false}')).price_mnt,
          null, 'empty price falls back to default');
select throws_ok($$ select public.admin_save_catalog('{"id":"draft-film","kind":"movie","title":"x","price_mnt":5}') $$,
                 '23514', null, 'too low price rejected');
select is((public.admin_save_catalog('{"id":"draft-series","kind":"series","orientation":"vertical","title":"x","price_mnt":9900}')).price_mnt,
          9900, 'series price saved');
-- Анги: зөвхөн цувралд, дугаараар засна.
select is((public.admin_save_episode('{"series_id":"draft-series","number":1,"title":"Эхлэл","duration":"2:30"}')).title,
          'Эхлэл', 'admin adds an episode');
select is((public.admin_save_episode('{"series_id":"draft-series","number":1,"title":"Эхлэл 2"}')).title,
          'Эхлэл 2', 'admin edits the same episode');
select is((select count(*) from public.episodes where series_id = 'draft-series')::int, 1, 'episode edit does not duplicate');
select throws_ok($$ select public.admin_save_episode('{"series_id":"draft-film","number":1}') $$,
                 'P0002', 'series_not_found', 'movies have no episodes');
select is((select categories from public.catalog where id = 'metropolis'), array['old'], 'sample movies are old films');
select ok((select video_ready from public.catalog where id = 'draft-film') = false, 'save never marks video ready');
select is((select count(*) from public.catalog where id = 'draft-film')::int, 1, 'admin sees drafts');

-- Хэрэглэгч, зочин ноорог харахгүй, засаж чадахгүй.
select pg_temp.as_user('bbbbbbbb-0000-4000-8000-000000000001');
select is((select count(*) from public.catalog where id = 'draft-film')::int, 0, 'user does not see drafts');
select is((select count(*) from public.episodes where series_id = 'draft-series')::int, 0, 'user does not see draft episodes');
select throws_ok($$ select public.admin_save_episode('{"series_id":"draft-series","number":2}') $$, '42501', 'forbidden', 'user cannot save episodes');
select throws_ok($$ select public.admin_save_catalog('{"id":"x","kind":"movie","title":"x"}') $$, '42501', 'forbidden', 'user cannot save');
select throws_ok($$ update public.catalog set published = true $$, '42501', null, 'user cannot update the table');
select pg_temp.as_anon();
select is((select count(*) from public.catalog where id = 'draft-film')::int, 0, 'anon does not see drafts');
select pg_temp.as_service();
update public.catalog set published = true where id = 'draft-series';
select pg_temp.as_anon();
select is((select count(*) from public.episodes where series_id = 'draft-series')::int, 1, 'anon sees published series episodes');

-- Сервер (upload дуусахад) видеоны төлөвийг өөрчилнө.
select pg_temp.as_service();
update public.catalog set video_ready = true, video_size = 123, published = true where id = 'draft-film';
select is((select video_ready and published from public.catalog where id = 'draft-film'), true, 'service role marks video ready and publishes');

select * from finish();
rollback;
