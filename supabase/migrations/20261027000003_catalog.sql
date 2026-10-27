-- Кино ба Shorts-ийн жагсаалт Supabase-д: админ сайтаас кино тус бүрээр нэмж, засна (movies.json-ийн оронд).
-- Видео R2-д (movies/<id>.mp4, shorts/<id>.mp4), зураг R2-д (thumbnails/...). Видео хуулж дуусахад video_ready.
create table public.catalog (
  id text primary key check (id ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(id) <= 100),
  kind text not null check (kind in ('movie', 'short')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  year int check (year between 1880 and 2100),
  genres text[] not null default '{}',
  duration text check (duration ~ '^\d{1,2}(:\d{2}){1,2}$'),
  description text not null default '' check (char_length(description) <= 5000),
  thumbnail text check (thumbnail ~ '^thumbnails/[a-z0-9._/-]+$'),
  subtitles jsonb,
  movie_id text references public.catalog (id) on delete set null,
  added date not null default (now() at time zone 'Asia/Ulaanbaatar')::date,
  published boolean not null default false,
  video_ready boolean not null default false,
  video_size bigint,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_short_movie check (kind = 'short' or movie_id is null)
);
create index catalog_kind_idx on public.catalog (kind, added desc);

alter table public.catalog enable row level security;
revoke all on table public.catalog from anon, authenticated;
grant select on table public.catalog to anon, authenticated;
grant select, insert, update, delete on table public.catalog to service_role;
create policy "catalog: anon reads published" on public.catalog for select to anon using (published);
create policy "catalog: users read published, admin all" on public.catalog for select to authenticated
  using (published or private.is_admin());

-- Админ: кино/Shorts нэмэх, засах. Видеоны төлөв (video_ready, video_size)-ийг зөвхөн сервер өөрчилнө.
create function public.admin_save_catalog(p jsonb)
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
  insert into public.catalog as c (id, kind, title, year, genres, duration, description, thumbnail, subtitles, movie_id, added, published)
  values (
    v_id, v_kind, btrim(p ->> 'title'),
    nullif(p ->> 'year', '')::int,
    coalesce(array(select btrim(g) from jsonb_array_elements_text(coalesce(p -> 'genres', '[]')) g where btrim(g) <> ''), '{}'),
    nullif(btrim(p ->> 'duration'), ''),
    coalesce(p ->> 'description', ''),
    nullif(p ->> 'thumbnail', ''),
    case when jsonb_typeof(p -> 'subtitles') in ('string', 'array') then p -> 'subtitles' end,
    case when v_kind = 'short' then nullif(p ->> 'movie_id', '') end,
    coalesce(nullif(p ->> 'added', '')::date, (now() at time zone 'Asia/Ulaanbaatar')::date),
    coalesce((p ->> 'published')::boolean, false)
  )
  on conflict (id) do update set
    title = excluded.title, year = excluded.year, genres = excluded.genres, duration = excluded.duration,
    description = excluded.description, thumbnail = excluded.thumbnail, subtitles = excluded.subtitles,
    movie_id = excluded.movie_id, added = excluded.added, published = excluded.published, updated_at = now()
  returning * into v_row;
  perform private.audit('admin', case when v_old.id is null then 'catalog.created' else 'catalog.updated' end, null,
                        jsonb_build_object('id', v_id, 'kind', v_kind, 'published', v_row.published));
  return v_row;
end;
$$;
revoke execute on function public.admin_save_catalog(jsonb) from public, anon;
grant execute on function public.admin_save_catalog(jsonb) to authenticated;

-- Одоо байгаа жишээ жагсаалт (видео, зураг нь хараахан байршаагүй).
insert into public.catalog (id, kind, title, year, genres, duration, description, movie_id, added, published) values
  ('metropolis', 'movie', 'Метрополис', 1927, array['Шинжлэх ухааны уран зөгнөлт', 'Драм']::text[], '2:33:00', 'Ирээдүйн аварга хотод баячууд дээд давхарт, ажилчид газар доор амьдарна. Фрицын хүү Фредер хоёр ертөнцийг холбох гэж оролддог.', null, '2026-10-18'::date, true),
  ('nosferatu', 'movie', 'Носферату', 1922, array['Аймшгийн']::text[], '1:34:00', 'Үл хөдлөх хөрөнгийн зуучлагч Хуттер нууцлаг гүн Орлокын шилтгээнд очиход аймшигт үйл явдал эхэлнэ.', null, '2026-10-17'::date, true),
  ('the-general', 'movie', 'Генерал', 1926, array['Инээдмийн', 'Адал явдалт']::text[], '1:18:00', 'Бастер Китоны хамгийн алдартай кино. Машинч Жонни хулгайлагдсан галт тэрэг болон хайртай бүсгүйгээ буцааж авахаар хөөцөлдөнө.', null, '2026-10-16'::date, true),
  ('night-of-the-living-dead', 'movie', 'Амьд үхэгсдийн шөнө', 1968, array['Аймшгийн']::text[], '1:36:00', 'Хөдөөний нэгэн байшинд хоргодсон хэдэн хүн шөнөжин үхэгсдийн довтолгооноос хамгаалж үлдэх ёстой.', null, '2026-10-15'::date, true),
  ('his-girl-friday', 'movie', 'Түүний Баасан гараг', 1940, array['Инээдмийн', 'Романтик']::text[], '1:32:00', 'Сонины редактор хуучин эхнэр, шилдэг сурвалжлагчаа дахин гэрлэхээс нь өмнө ажилдаа буцаан татахыг оролдоно.', null, '2026-10-14'::date, true),
  ('the-kid', 'movie', 'Хүүхэд', 1921, array['Инээдмийн', 'Драм']::text[], '1:08:00', 'Чарли Чаплины Тэнүүлч гудамжинд орхигдсон нялх хүүхдийг олж, өөрийн хүү шиг өсгөнө.', null, '2026-10-13'::date, true),
  ('a-trip-to-the-moon', 'movie', 'Сар руу аялал', 1902, array['Шинжлэх ухааны уран зөгнөлт', 'Адал явдалт']::text[], '0:14:00', 'Жорж Мельесийн богино кино. Одон орон судлаачид их буугаар сар руу нисч, тэндхийн оршин суугчидтай уулзана.', null, '2026-10-12'::date, true),
  ('charade', 'movie', 'Шарад', 1963, array['Триллер', 'Романтик']::text[], '1:53:00', 'Нөхрөө алагдсаны дараа Реджина Парист нууцлаг эрчүүдэд мөшгөгдөнө. Тэд бүгд алга болсон мөнгийг хайж байна.', null, '2026-10-11'::date, true),
  ('sherlock-jr', 'movie', 'Шерлок бага', 1924, array['Инээдмийн']::text[], '0:45:00', 'Кино театрын проекторч мөрдөгч болохыг мөрөөдөж, зүүдэндээ дэлгэц рүү орж нууцыг тайлна.', null, '2026-10-10'::date, true),
  ('the-cabinet-of-dr-caligari', 'movie', 'Доктор Калигаригийн кабинет', 1920, array['Аймшгийн', 'Триллер']::text[], '1:16:00', 'Германы экспрессионизмын сонгодог бүтээл. Ид шидтэн Калигари болон түүний нойрсогч Чезаре хотод айдас тарина.', null, '2026-10-09'::date, true)
on conflict (id) do nothing;

insert into public.catalog (id, kind, title, year, genres, duration, description, movie_id, added, published) values
  ('metropolis-robot-maria', 'short', 'Робот Мариа амь ордог мөч', null, '{}'::text[], '1:12', 'Ротвангийн лабораторид машин хүн анх удаа нүдээ нээнэ. Кино түүхийн хамгийн алдартай үзэгдлийн нэг.', 'metropolis', '2026-10-21'::date, true),
  ('general-train-chase', 'short', 'Галт тэрэгний хөөцөлдөөн', null, '{}'::text[], '3:40', 'Бастер Китон ямар ч дублёргүйгээр хөдөлж буй галт тэрэг дээр трюк хийнэ.', 'the-general', '2026-10-21'::date, true),
  ('nosferatu-stairs', 'short', 'Шатан дээрх сүүдэр', null, '{}'::text[], '0:48', 'Гүн Орлокын сүүдэр шатаар аажуухан мөлхөн гарна. Аймшгийн киноны сонгодог кадр.', 'nosferatu', '2026-10-20'::date, true),
  ('moon-landing', 'short', 'Сарны нүдэнд пуужин', null, '{}'::text[], '2:05', 'Жорж Мельесийн 1902 оны кинон дахь сарны нүдэнд пуужин буух алдартай мөч.', 'a-trip-to-the-moon', '2026-10-20'::date, true),
  ('sherlock-jr-screen', 'short', 'Дэлгэц рүү үсэрсэн кино механикч', null, '{}'::text[], '6:30', 'Шерлок бага кинон дахь гайхалтай монтажийн трюкүүд хэрхэн бүтсэн бэ.', 'sherlock-jr', '2026-10-19'::date, true),
  ('silent-film-explained', 'short', 'Дуугүй кино яагаад 24 биш 18 кадртай вэ?', null, '{}'::text[], '12:15', 'Эрт үеийн кино камер, гар эргүүлгийн хурд, хуучин кино яагаад хурдан харагддаг тухай товч тайлбар.', null, '2026-10-19'::date, true),
  ('caligari-sets', 'short', 'Калигаригийн муруй ертөнц', null, '{}'::text[], '4:20', 'Будсан хана, хазгай цонх: экспрессионист декорацийг хэрхэн бүтээсэн бэ.', 'the-cabinet-of-dr-caligari', '2026-10-18'::date, true),
  ('kid-best-moments', 'short', 'Чаплин ба Хүүхэд: шилдэг 5 мөч', null, '{}'::text[], '9:58', 'Чарли Чаплин, Жеки Куган хоёрын инээдтэй бас сэтгэл хөдлөм үзэгдлүүд.', 'the-kid', '2026-10-18'::date, true)
on conflict (id) do nothing;
