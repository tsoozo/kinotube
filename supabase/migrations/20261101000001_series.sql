-- Кино 2 хэлбэртэй: хэвтээ (horizontal), босоо (vertical). Төрөл нь нэг ангитай кино (movie) эсвэл
-- олон ангитай цуврал (series). Shorts = босоо цуврал. Цувралын анги бүр тусдаа видео (episodes).
-- Үнэгүй: кино эхний 5 минут, цуврал эхний 2 анги (сервер functions/api/video шалгана), цааш нь эрх.
-- Хуучин "short" (киноноос тасалсан хэсэг) ойлголтыг болиулж, байгаа бичлэгийг 1 ангитай босоо цуврал болгоно.

alter table public.catalog
  add column orientation text not null default 'horizontal' check (orientation in ('horizontal', 'vertical'));
alter table public.catalog drop constraint if exists catalog_short_movie;
alter table public.catalog drop constraint if exists catalog_kind_check;

create table public.episodes (
  series_id text not null references public.catalog (id) on delete cascade,
  number int not null check (number between 1 and 999),
  title text not null default '' check (char_length(title) <= 200),
  duration text check (duration ~ '^\d{1,2}(:\d{2}){1,2}$'),
  video_key text check (video_key ~ '^(episodes|shorts)/[a-z0-9._/-]+$'),
  video_ready boolean not null default false,
  video_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (series_id, number)
);

alter table public.episodes enable row level security;
revoke all on table public.episodes from anon, authenticated;
grant select on table public.episodes to anon, authenticated;
grant select, insert, update, delete on table public.episodes to service_role;
create policy "episodes: anon reads published" on public.episodes for select to anon
  using (exists (select 1 from public.catalog c where c.id = series_id and c.published));
create policy "episodes: users read published, admin all" on public.episodes for select to authenticated
  using (private.is_admin() or exists (select 1 from public.catalog c where c.id = series_id and c.published));

-- Видеогүй жишээ Shorts-ийг устгана.
delete from public.catalog
 where kind = 'short' and not video_ready
   and id in ('metropolis-robot-maria', 'general-train-chase', 'nosferatu-stairs', 'moon-landing',
              'sherlock-jr-screen', 'silent-film-explained', 'caligari-sets', 'kid-best-moments');

-- Үлдсэн Shorts: 1 ангитай босоо цуврал, видео нь хуучин байрандаа (shorts/<id>.mp4).
insert into public.episodes (series_id, number, duration, video_key, video_ready, video_size)
select id, 1, duration, 'shorts/' || id || '.mp4', video_ready, video_size from public.catalog where kind = 'short';
update public.catalog
   set kind = 'series', orientation = 'vertical', movie_id = null, video_ready = false, video_size = null, updated_at = now()
 where kind = 'short';

alter table public.catalog add constraint catalog_kind_check check (kind in ('movie', 'series'));

-- Админ: кино/цуврал нэмэх, засах. Видеоны төлөвийг зөвхөн сервер өөрчилнө.
create or replace function public.admin_save_catalog(p jsonb)
returns public.catalog
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id text := lower(btrim(p ->> 'id'));
  v_kind text := coalesce(p ->> 'kind', 'movie');
  v_old public.catalog%rowtype;
  v_row public.catalog%rowtype;
begin
  perform private.require_admin();
  select * into v_old from public.catalog where id = v_id;
  if found and v_old.kind <> v_kind then
    raise exception 'kind_mismatch' using errcode = '22023';
  end if;
  insert into public.catalog as c (id, kind, orientation, title, year, genres, categories, price_mnt, duration, description, thumbnail, subtitles, added, published)
  values (
    v_id, v_kind,
    coalesce(nullif(p ->> 'orientation', ''), 'horizontal'),
    btrim(p ->> 'title'),
    nullif(p ->> 'year', '')::int,
    coalesce(array(select btrim(g) from jsonb_array_elements_text(coalesce(p -> 'genres', '[]')) g where btrim(g) <> ''), '{}'),
    coalesce(array(select distinct g from jsonb_array_elements_text(coalesce(p -> 'categories', '[]')) g order by g), '{}'),
    nullif(p ->> 'price_mnt', '')::int,
    nullif(btrim(p ->> 'duration'), ''),
    coalesce(p ->> 'description', ''),
    nullif(p ->> 'thumbnail', ''),
    case when jsonb_typeof(p -> 'subtitles') in ('string', 'array') then p -> 'subtitles' end,
    coalesce(nullif(p ->> 'added', '')::date, (now() at time zone 'Asia/Ulaanbaatar')::date),
    coalesce((p ->> 'published')::boolean, false)
  )
  on conflict (id) do update set
    orientation = excluded.orientation, title = excluded.title, year = excluded.year, genres = excluded.genres,
    categories = excluded.categories, price_mnt = excluded.price_mnt, duration = excluded.duration,
    description = excluded.description, thumbnail = excluded.thumbnail, subtitles = excluded.subtitles,
    added = excluded.added, published = excluded.published, updated_at = now()
  returning * into v_row;
  perform private.audit('admin', case when v_old.id is null then 'catalog.created' else 'catalog.updated' end, null,
                        jsonb_build_object('id', v_id, 'kind', v_kind, 'published', v_row.published, 'price_mnt', v_row.price_mnt));
  return v_row;
end;
$$;
revoke execute on function public.admin_save_catalog(jsonb) from public, anon;
grant execute on function public.admin_save_catalog(jsonb) to authenticated;

-- Админ: цувралын анги нэмэх, засах (дугаар, нэр, урт). Видеог functions/api/admin/upload.js хуулна.
create function public.admin_save_episode(p jsonb)
returns public.episodes
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_series text := lower(btrim(p ->> 'series_id'));
  v_row public.episodes%rowtype;
begin
  perform private.require_admin();
  if not exists (select 1 from public.catalog where id = v_series and kind = 'series') then
    raise exception 'series_not_found' using errcode = 'P0002';
  end if;
  insert into public.episodes as e (series_id, number, title, duration)
  values (v_series, (p ->> 'number')::int, coalesce(btrim(p ->> 'title'), ''), nullif(btrim(p ->> 'duration'), ''))
  on conflict (series_id, number) do update set
    title = excluded.title, duration = excluded.duration, updated_at = now()
  returning * into v_row;
  update public.catalog set updated_at = now() where id = v_series;
  return v_row;
end;
$$;
revoke execute on function public.admin_save_episode(jsonb) from public, anon;
grant execute on function public.admin_save_episode(jsonb) to authenticated;

-- Нэг кино эсвэл цувралын төлбөр: catalog.price_mnt, хоосон бол products-ийн үнэ.
create or replace function public.create_payment_request(p_product text, p_movie_id text default null, p_movie_title text default null)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.products%rowtype;
  v_movie text := case when p_product = 'rent' then nullif(btrim(p_movie_id), '') end;
  v_price int;
  v_code text;
  v_attempt int := 0;
  v_row public.payment_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if private.is_blocked(v_uid) then
    raise exception 'blocked' using errcode = '42501';
  end if;
  select * into p from public.products where code = p_product and active;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;
  if p.code = 'rent' and v_movie is null then
    raise exception 'movie_required' using errcode = '22023';
  end if;
  v_price := coalesce(
    (select c.price_mnt from public.catalog c where p.code = 'rent' and c.id = v_movie and c.kind in ('movie', 'series')),
    p.price_mnt);

  perform private.lock_user(v_uid);
  perform private.expire_payment_requests(v_uid);

  select * into v_row from public.payment_requests r
   where r.user_id = v_uid and r.product = p.code and r.movie_id is not distinct from v_movie
     and r.status in ('created', 'submitted')
   order by r.created_at desc limit 1;
  if found then
    if v_row.status = 'created' and v_row.amount_mnt <> v_price then
      update public.payment_requests set amount_mnt = v_price where id = v_row.id returning * into v_row;
    end if;
    return v_row;
  end if;

  if (select count(*) from public.payment_requests
       where user_id = v_uid and status in ('created', 'submitted')) >= 3 then
    raise exception 'too_many_open' using errcode = 'P0001';
  end if;

  loop
    v_code := 'KT-' || (floor(random() * 9 * power(10, 3 + v_attempt / 20)) + power(10, 3 + v_attempt / 20))::bigint::text;
    exit when not exists (select 1 from public.payment_requests where ref_code = v_code);
    v_attempt := v_attempt + 1;
  end loop;

  insert into public.payment_requests (user_id, product, movie_id, movie_title, ref_code, amount_mnt)
  values (v_uid, p.code, v_movie, case when v_movie is not null then left(btrim(p_movie_title), 120) end, v_code, v_price)
  returning * into v_row;
  perform private.audit('user', 'payment.created', v_uid, jsonb_build_object('ref_code', v_code, 'product', p.code, 'movie_id', v_movie));
  return v_row;
end;
$$;
grant execute on function public.create_payment_request(text, text, text) to authenticated;
