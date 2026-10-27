-- Киноны ангилал: Хуучны кино, AI кино, Монгол кино, Хятад кино, Солонгос кино (нэг кино хэд хэдэнд орж болно).
-- Түлхүүр латинаар, нэрийг сайт (src/data.js CATEGORIES) харуулна. Shorts ангилалгүй (холбоотой киногоороо шүүгдэнэ).
alter table public.catalog
  add column categories text[] not null default '{}'
  check (categories <@ array['old', 'ai', 'mongolian', 'chinese', 'korean']::text[]);

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
  insert into public.catalog as c (id, kind, title, year, genres, categories, duration, description, thumbnail, subtitles, movie_id, added, published)
  values (
    v_id, v_kind, btrim(p ->> 'title'),
    nullif(p ->> 'year', '')::int,
    coalesce(array(select btrim(g) from jsonb_array_elements_text(coalesce(p -> 'genres', '[]')) g where btrim(g) <> ''), '{}'),
    case when v_kind = 'movie'
      then coalesce(array(select distinct g from jsonb_array_elements_text(coalesce(p -> 'categories', '[]')) g order by g), '{}')
      else '{}' end,
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
    duration = excluded.duration, description = excluded.description, thumbnail = excluded.thumbnail,
    subtitles = excluded.subtitles, movie_id = excluded.movie_id, added = excluded.added, published = excluded.published,
    updated_at = now()
  returning * into v_row;
  perform private.audit('admin', case when v_old.id is null then 'catalog.created' else 'catalog.updated' end, null,
                        jsonb_build_object('id', v_id, 'kind', v_kind, 'published', v_row.published));
  return v_row;
end;
$$;
revoke execute on function public.admin_save_catalog(jsonb) from public, anon;
grant execute on function public.admin_save_catalog(jsonb) to authenticated;

-- Жишээ кинонууд бүгд 1902–1968 оных: "Хуучны кино".
update public.catalog set categories = '{old}'
where kind = 'movie' and categories = '{}' and id in (
  'metropolis', 'nosferatu', 'the-general', 'night-of-the-living-dead', 'his-girl-friday',
  'the-kid', 'a-trip-to-the-moon', 'charade', 'sherlock-jr', 'the-cabinet-of-dr-caligari'
);
