-- Кино тус бүрийн үнэ (нэг кино, 3 хоног). Хоосон бол products-ийн 'rent' үнэ (4,900₮).
-- Админ сайтаас кино засахдаа тохируулна. Төлбөрийн дүнг сервер эндээс авна.
alter table public.catalog
  add column price_mnt int check (price_mnt between 100 and 1000000);

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
  insert into public.catalog as c (id, kind, title, year, genres, categories, price_mnt, duration, description, thumbnail, subtitles, movie_id, added, published)
  values (
    v_id, v_kind, btrim(p ->> 'title'),
    nullif(p ->> 'year', '')::int,
    coalesce(array(select btrim(g) from jsonb_array_elements_text(coalesce(p -> 'genres', '[]')) g where btrim(g) <> ''), '{}'),
    case when v_kind = 'movie'
      then coalesce(array(select distinct g from jsonb_array_elements_text(coalesce(p -> 'categories', '[]')) g order by g), '{}')
      else '{}' end,
    case when v_kind = 'movie' then nullif(p ->> 'price_mnt', '')::int end,
    nullif(btrim(p ->> 'duration'), ''),
    coalesce(p ->> 'description', ''),
    nullif(p ->> 'thumbnail', ''),
    case when jsonb_typeof(p -> 'subtitles') in ('string', 'array') then p -> 'subtitles' end,
    case when v_kind = 'short' then nullif(p ->> 'movie_id', '') end,
    coalesce(nullif(p ->> 'added', '')::date, (now() at time zone 'Asia/Ulaanbaatar')::date),
    coalesce((p ->> 'published')::boolean, false)
  )
  on conflict (id) do update set
    title = excluded.title, year = excluded.year, genres = excluded.genres, categories = excluded.categories,
    price_mnt = excluded.price_mnt, duration = excluded.duration, description = excluded.description,
    thumbnail = excluded.thumbnail, subtitles = excluded.subtitles, movie_id = excluded.movie_id,
    added = excluded.added, published = excluded.published, updated_at = now()
  returning * into v_row;
  perform private.audit('admin', case when v_old.id is null then 'catalog.created' else 'catalog.updated' end, null,
                        jsonb_build_object('id', v_id, 'kind', v_kind, 'published', v_row.published, 'price_mnt', v_row.price_mnt));
  return v_row;
end;
$$;
revoke execute on function public.admin_save_catalog(jsonb) from public, anon;
grant execute on function public.admin_save_catalog(jsonb) to authenticated;

-- Нэг киноны төлбөр: catalog.price_mnt, хоосон бол products-ийн үнэ.
-- Шилжүүлэг хийгээгүй (created) хүсэлтийн дүнг шинэ үнээр шинэчилнэ.
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
    (select c.price_mnt from public.catalog c where p.code = 'rent' and c.id = v_movie and c.kind = 'movie'),
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
    -- KT-1234; 4 оронтой кодууд дүүрвэл 5+ орон болно.
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
