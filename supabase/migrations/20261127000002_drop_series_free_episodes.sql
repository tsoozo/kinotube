-- Цуврал бүрт үнэгүй ангийн тоог (free_episodes) буцаана (zoye, 2026-11-27). Ерөнхий дүрэм server/free.js хэвээр.
alter table public.catalog drop column if exists free_episodes;

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
