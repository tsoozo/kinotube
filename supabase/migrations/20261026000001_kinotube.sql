-- KinoTube: хэрэглэгч, сарын эрх, нэг киноны түрээс, банкны шилжүүлгээр төлөх (Telegram-аар батлах),
-- админ хэсэг, үзэлтийн тоо.
--
-- Аюулгүй байдал
--  * Бүх хүснэгтэд RLS. Supabase шинэ хүснэгт/функцэд олгодог эрхийг хасаад хэрэгтэйг нь л өгнө.
--  * Мөнгө, эрхтэй холбоотой бүх зүйл SECURITY DEFINER функцээр; хэрэглэгч хүснэгт рүү шууд бичихгүй.
--  * Үнийг үргэлж products хүснэгтээс авна.
--  * Төлбөр батлахыг зөвхөн сервер (Telegram webhook, service role) эсвэл админ хийнэ.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

-- Эзэмшигчийн имэйл: анх бүртгүүлэхэд автоматаар админ болно.
create function private.owner_email()
returns text language sql immutable as $$ select 'kinotubemn@gmail.com' $$;

create function private.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;
grant execute on function private.is_service_role() to anon, authenticated, service_role;

-- Нэг хэрэглэгчийн мөнгөн үйлдлийг дараалуулна (зэрэг дарсан ч нэг л удаа).
create function private.lock_user(p_user uuid)
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(hashtextextended(p_user::text, 0));
$$;

-------------------------------------------------------------------------------
-- profiles
-------------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 80),
  is_admin boolean not null default false,
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name) on table public.profiles to authenticated;

create policy "profiles: read own" on public.profiles for select to authenticated
  using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function private.is_admin(p_user uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.is_admin and not p.blocked from public.profiles p where p.id = p_user), false);
$$;
grant execute on function private.is_admin(uuid) to authenticated, service_role;

create function private.is_blocked(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select p.blocked from public.profiles p where p.id = p_user), false);
$$;

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
          lower(coalesce(new.email, '')) = private.owner_email())
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-------------------------------------------------------------------------------
-- products: 'month' (бүх кино, 1 сар), 'rent' (нэг кино, 3 хоног).
-- Үнийг Supabase → Table Editor → products дээр өөрчилнө.
-------------------------------------------------------------------------------
create table public.products (
  code text primary key check (code in ('month', 'rent')),
  title text not null,
  price_mnt int not null check (price_mnt > 0),
  period interval not null,
  active boolean not null default true
);
alter table public.products enable row level security;
revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;
create policy "products: read" on public.products for select to anon, authenticated using (true);

insert into public.products (code, title, price_mnt, period) values
  ('month', 'Сарын эрх', 15900, interval '1 month'),
  ('rent',  'Нэг кино',  4900,  interval '3 days')
on conflict (code) do nothing;

-------------------------------------------------------------------------------
-- payment_requests: банкны шилжүүлгийн хүсэлт (гүйлгээний утга KT-1234).
-------------------------------------------------------------------------------
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product text not null references public.products (code),
  movie_id text check (char_length(movie_id) <= 100),
  movie_title text check (char_length(movie_title) <= 120),
  ref_code text not null unique,
  amount_mnt int not null check (amount_mnt > 0),
  status text not null default 'created'
    check (status in ('created', 'submitted', 'approved', 'rejected', 'expired')),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by_telegram_id bigint,
  decided_by_user_id uuid references auth.users (id) on delete set null,
  reject_reason text,
  telegram_chat_id bigint,
  telegram_message_id bigint,
  created_at timestamptz not null default now(),
  constraint payment_requests_rent_movie check (product <> 'rent' or movie_id is not null)
);
create index payment_requests_user_idx on public.payment_requests (user_id, created_at desc);
create index payment_requests_status_idx on public.payment_requests (status, created_at desc);
create index payment_requests_tg_msg_idx on public.payment_requests (telegram_chat_id, telegram_message_id)
  where telegram_message_id is not null;

alter table public.payment_requests enable row level security;
revoke all on table public.payment_requests from anon, authenticated;
grant select on table public.payment_requests to authenticated;
create policy "payment_requests: read own" on public.payment_requests for select to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- subscriptions (бүх кино), rentals (нэг кино). Дараалан авбал сунгагдана.
-------------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  source text not null check (source in ('payment', 'admin')),
  note text,
  payment_request_id uuid unique references public.payment_requests (id) on delete set null,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint subscriptions_range check (expires_at > starts_at)
);
create index subscriptions_user_idx on public.subscriptions (user_id, expires_at desc);

create table public.rentals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id text not null,
  movie_title text,
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  source text not null check (source in ('payment', 'admin')),
  payment_request_id uuid unique references public.payment_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint rentals_range check (expires_at > starts_at)
);
create index rentals_user_idx on public.rentals (user_id, movie_id, expires_at desc);

alter table public.subscriptions enable row level security;
alter table public.rentals enable row level security;
revoke all on table public.subscriptions, public.rentals from anon, authenticated;
grant select on table public.subscriptions, public.rentals to authenticated;
create policy "subscriptions: read own" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy "rentals: read own" on public.rentals for select to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- views: кино бүрийг хэн үзэж эхэлсэн, дуусгасан (админы "Үзэлт").
-------------------------------------------------------------------------------
create table public.views (
  user_id uuid not null references auth.users (id) on delete cascade,
  movie_id text not null check (char_length(movie_id) <= 100),
  first_at timestamptz not null default now(),
  last_at timestamptz not null default now(),
  done boolean not null default false,
  primary key (user_id, movie_id)
);
alter table public.views enable row level security;
revoke all on table public.views from anon, authenticated;

-------------------------------------------------------------------------------
-- audit_log: төлбөр, эрхийн өөрчлөлт бүр.
-------------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null check (actor in ('user', 'admin', 'telegram', 'system')),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_telegram_id bigint,
  action text not null,
  target_user_id uuid references auth.users (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;

create function private.audit(p_actor text, p_action text, p_target uuid, p_data jsonb, p_tg bigint default null)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_log (actor, actor_user_id, actor_telegram_id, action, target_user_id, data)
  values (p_actor, auth.uid(), p_tg, p_action, p_target, coalesce(p_data, '{}'::jsonb));
$$;

-------------------------------------------------------------------------------
-- Rate limit (сервер функцууд ашиглана).
-------------------------------------------------------------------------------
create table private.rate_limits (
  key text not null,
  window_start timestamptz not null,
  hits int not null default 0,
  primary key (key, window_start)
);

create function public.check_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  v_hits int;
begin
  insert into private.rate_limits as r (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = r.hits + 1
  returning hits into v_hits;
  if random() < 0.01 then
    delete from private.rate_limits where window_start < now() - interval '1 day';
  end if;
  return v_hits <= p_max;
end;
$$;
revoke execute on function public.check_rate_limit(text, int, int) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, int, int) to service_role;

-------------------------------------------------------------------------------
-- Эрх шалгах
-------------------------------------------------------------------------------
create function private.subscription_until(p_user uuid)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  -- Дараалан авсан эрхүүдийн төгсгөл (одоо идэвхтэй нэг нь байвал).
  select max(s.expires_at) from public.subscriptions s
   where s.user_id = p_user and s.expires_at > now()
     and exists (select 1 from public.subscriptions a
                  where a.user_id = p_user and a.starts_at <= now() and a.expires_at > now());
$$;

create function private.rental_until(p_user uuid, p_movie text)
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(r.expires_at) from public.rentals r
   where r.user_id = p_user and r.movie_id = p_movie and r.expires_at > now()
     and exists (select 1 from public.rentals a
                  where a.user_id = p_user and a.movie_id = p_movie and a.starts_at <= now() and a.expires_at > now());
$$;

-- Видео линк гаргахаас өмнө сервер шалгана.
create function public.can_watch(p_user uuid, p_movie text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.is_blocked(p_user)
     and (private.subscription_until(p_user) is not null or private.rental_until(p_user, p_movie) is not null);
$$;
revoke execute on function public.can_watch(uuid, text) from public, anon, authenticated;
grant execute on function public.can_watch(uuid, text) to service_role;

-- Нэвтэрсэн хэрэглэгчийн бүх мэдээлэл нэг дор: апп эхлэхэд нэг удаа уншина.
create function public.me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'name', coalesce(p.display_name, split_part(u.email, '@', 1)),
    'created_at', coalesce(p.created_at, u.created_at),
    'is_admin', coalesce(p.is_admin, false),
    'blocked', coalesce(p.blocked, false),
    'subscription_until', private.subscription_until(u.id),
    'subscription_source', (select s.source from public.subscriptions s
                             where s.user_id = u.id and s.expires_at > now()
                             order by s.expires_at desc limit 1),
    'last_subscription_end', (select max(s.expires_at) from public.subscriptions s where s.user_id = u.id),
    'rentals', coalesce((select jsonb_agg(jsonb_build_object('id', x.movie_id, 'title', x.movie_title, 'endsAt', x.until)
                                          order by x.until desc)
                           from (select r.movie_id, max(r.movie_title) as movie_title,
                                        private.rental_until(u.id, r.movie_id) as until
                                   from public.rentals r
                                  where r.user_id = u.id and r.expires_at > now()
                                  group by r.movie_id) x
                          where x.until is not null), '[]'::jsonb)
  ) end
  from auth.users u
  left join public.profiles p on p.id = u.id
  where u.id = auth.uid();
$$;
grant execute on function public.me() to authenticated;

-------------------------------------------------------------------------------
-- 24 цагийн дотор "Гүйлгээ хийсэн" дараагүй хүсэлт хүчингүй болно.
-------------------------------------------------------------------------------
create function private.expire_payment_requests(p_user uuid default null)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare v_count int;
begin
  update public.payment_requests
     set status = 'expired'
   where status = 'created'
     and created_at < now() - interval '24 hours'
     and (p_user is null or user_id = p_user);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

do $$
begin
  create extension if not exists pg_cron;
  perform cron.schedule('kinotube-expire-payment-requests', '*/15 * * * *',
                        'select private.expire_payment_requests()');
exception when others then
  raise notice 'pg_cron unavailable (%); relying on lazy expiry', sqlerrm;
end;
$$;

-------------------------------------------------------------------------------
-- Хэрэглэгч: эрх сонгоход хүсэлт үүсгэнэ. Ижил хүсэлт нээлттэй байвал түүнийг буцаана.
-------------------------------------------------------------------------------
create function public.create_payment_request(p_product text, p_movie_id text default null, p_movie_title text default null)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.products%rowtype;
  v_movie text := case when p_product = 'rent' then nullif(btrim(p_movie_id), '') end;
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

  perform private.lock_user(v_uid);
  perform private.expire_payment_requests(v_uid);

  select * into v_row from public.payment_requests r
   where r.user_id = v_uid and r.product = p.code and r.movie_id is not distinct from v_movie
     and r.status in ('created', 'submitted')
   order by r.created_at desc limit 1;
  if found then
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
  values (v_uid, p.code, v_movie, case when v_movie is not null then left(btrim(p_movie_title), 120) end, v_code, p.price_mnt)
  returning * into v_row;
  perform private.audit('user', 'payment.created', v_uid, jsonb_build_object('ref_code', v_code, 'product', p.code, 'movie_id', v_movie));
  return v_row;
end;
$$;
grant execute on function public.create_payment_request(text, text, text) to authenticated;

-------------------------------------------------------------------------------
-- Хэрэглэгч: "Гүйлгээ хийсэн". created → submitted.
-- needs_notify: админд Telegram мессеж илгээх эсэх (өмнөх илгээлт амжилтгүй бол дахин).
-------------------------------------------------------------------------------
create function public.submit_payment_request(p_request_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  r public.payment_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  perform private.expire_payment_requests(v_uid);

  select * into r from public.payment_requests
   where id = p_request_id and user_id = v_uid
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if r.status = 'created' then
    if (select count(*) from public.payment_requests
         where user_id = v_uid and submitted_at > now() - interval '1 hour') >= 5 then
      raise exception 'rate_limited' using errcode = 'P0001';
    end if;
    update public.payment_requests set status = 'submitted', submitted_at = now()
     where id = r.id returning * into r;
    perform private.audit('user', 'payment.submitted', v_uid, jsonb_build_object('ref_code', r.ref_code));
    return jsonb_build_object('status', r.status, 'needs_notify', true);
  end if;

  return jsonb_build_object('status', r.status,
                            'needs_notify', r.status = 'submitted' and r.telegram_message_id is null);
end;
$$;
grant execute on function public.submit_payment_request(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Эрх олгох (төлбөр батлах, админ олгох хоёр хоёулаа ашиглана).
-- Идэвхтэй эрх байвал түүний төгсгөлөөс үргэлжилнэ.
-------------------------------------------------------------------------------
create function private.grant_subscription(p_user uuid, p_period interval, p_source text, p_request uuid, p_note text)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
  v_end timestamptz;
begin
  perform private.lock_user(p_user);
  v_start := greatest(now(), coalesce(private.subscription_until(p_user), now()));
  v_end := v_start + p_period;
  insert into public.subscriptions (user_id, starts_at, expires_at, source, note, payment_request_id, created_by)
  values (p_user, v_start, v_end, p_source, p_note, p_request, case when p_source = 'admin' then auth.uid() end);
  return private.subscription_until(p_user);
end;
$$;

create function private.grant_rental(p_user uuid, p_movie text, p_title text, p_period interval, p_source text, p_request uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_start timestamptz;
begin
  perform private.lock_user(p_user);
  v_start := greatest(now(), coalesce(private.rental_until(p_user, p_movie), now()));
  insert into public.rentals (user_id, movie_id, movie_title, starts_at, expires_at, source, payment_request_id)
  values (p_user, p_movie, p_title, v_start, v_start + p_period, p_source, p_request);
  return private.rental_until(p_user, p_movie);
end;
$$;

-------------------------------------------------------------------------------
-- Төлбөр батлах: submitted → approved, эрх олгоно. Давхар дарсан ч нэг удаа.
-- Telegram webhook (service role) эсвэл админ.
-------------------------------------------------------------------------------
create function public.approve_payment(p_request_id uuid, p_admin_telegram_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  r public.payment_requests%rowtype;
  p public.products%rowtype;
  v_until timestamptz;
begin
  if private.is_service_role() then
    v_admin := null;
  elsif private.is_admin() then
    v_admin := auth.uid();
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into r from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status = 'approved' then
    return jsonb_build_object('ok', true, 'already', true, 'status', r.status, 'ref_code', r.ref_code);
  end if;
  if r.status <> 'submitted' then
    return jsonb_build_object('ok', false, 'already', false, 'status', r.status, 'ref_code', r.ref_code);
  end if;

  select * into p from public.products where code = r.product;
  update public.payment_requests
     set status = 'approved', decided_at = now(), decided_by_telegram_id = p_admin_telegram_id, decided_by_user_id = v_admin
   where id = r.id;

  if p.code = 'month' then
    v_until := private.grant_subscription(r.user_id, p.period, 'payment', r.id, null);
  else
    v_until := private.grant_rental(r.user_id, r.movie_id, r.movie_title, p.period, 'payment', r.id);
  end if;

  perform private.audit(case when v_admin is null then 'telegram' else 'admin' end, 'payment.approved', r.user_id,
                        jsonb_build_object('ref_code', r.ref_code, 'until', v_until), p_admin_telegram_id);
  return jsonb_build_object('ok', true, 'already', false, 'status', 'approved', 'ref_code', r.ref_code, 'until', v_until);
end;
$$;
revoke execute on function public.approve_payment(uuid, bigint) from public, anon;
grant execute on function public.approve_payment(uuid, bigint) to authenticated, service_role;

create function public.reject_payment(p_request_id uuid, p_admin_telegram_id bigint default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin uuid;
  r public.payment_requests%rowtype;
begin
  if private.is_service_role() then
    v_admin := null;
  elsif private.is_admin() then
    v_admin := auth.uid();
  else
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select * into r from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if r.status = 'rejected' then
    return jsonb_build_object('ok', true, 'already', true, 'status', r.status, 'ref_code', r.ref_code);
  end if;
  if r.status not in ('created', 'submitted') then
    return jsonb_build_object('ok', false, 'already', false, 'status', r.status, 'ref_code', r.ref_code);
  end if;

  update public.payment_requests
     set status = 'rejected', decided_at = now(), decided_by_telegram_id = p_admin_telegram_id,
         decided_by_user_id = v_admin, reject_reason = left(nullif(btrim(p_reason), ''), 500)
   where id = r.id;
  perform private.audit(case when v_admin is null then 'telegram' else 'admin' end, 'payment.rejected', r.user_id,
                        jsonb_build_object('ref_code', r.ref_code), p_admin_telegram_id);
  return jsonb_build_object('ok', true, 'already', false, 'status', 'rejected', 'ref_code', r.ref_code);
end;
$$;
revoke execute on function public.reject_payment(uuid, bigint, text) from public, anon;
grant execute on function public.reject_payment(uuid, bigint, text) to authenticated, service_role;

-- Админ татгалзсан мессежид Telegram-д хариу бичвэл шалтгаан болно.
create function public.set_payment_reject_reason(p_request_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not (private.is_service_role() or private.is_admin()) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.payment_requests
     set reject_reason = left(nullif(btrim(p_reason), ''), 500)
   where id = p_request_id and status = 'rejected';
  return found;
end;
$$;
revoke execute on function public.set_payment_reject_reason(uuid, text) from public, anon;
grant execute on function public.set_payment_reject_reason(uuid, text) to authenticated, service_role;

-------------------------------------------------------------------------------
-- Үзэлт бүртгэх (эрхтэй хэрэглэгч кино нээхэд, дуусгахад).
-------------------------------------------------------------------------------
create function public.record_view(p_movie_id text, p_done boolean default false)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.views (user_id, movie_id, done)
  select auth.uid(), left(p_movie_id, 100), coalesce(p_done, false)
   where auth.uid() is not null
  on conflict (user_id, movie_id) do update
    set last_at = now(), done = public.views.done or excluded.done;
$$;
grant execute on function public.record_view(text, boolean) to authenticated;

-------------------------------------------------------------------------------
-- Админ
-------------------------------------------------------------------------------
create function private.require_admin()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return auth.uid();
end;
$$;

create function private.user_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id, 'email', u.email,
    'name', coalesce(p.display_name, split_part(u.email, '@', 1)),
    'created_at', coalesce(p.created_at, u.created_at),
    'is_admin', coalesce(p.is_admin, false), 'blocked', coalesce(p.blocked, false),
    'subscription_until', private.subscription_until(u.id),
    'last_subscription_end', (select max(s.expires_at) from public.subscriptions s where s.user_id = u.id),
    'rentals', (select count(distinct r.movie_id) from public.rentals r where r.user_id = u.id and r.expires_at > now()),
    'views', (select count(*) from public.views v where v.user_id = u.id),
    'paid_mnt', (select coalesce(sum(r.amount_mnt), 0) from public.payment_requests r
                  where r.user_id = u.id and r.status = 'approved'))
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user;
$$;

create function public.admin_list_users(p_filter text default 'all', p_query text default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select private.user_json(u.id)
      from auth.users u left join public.profiles p on p.id = u.id
     where (coalesce(btrim(p_query), '') = '' or u.email ilike '%' || btrim(p_query) || '%'
            or p.display_name ilike '%' || btrim(p_query) || '%')
       and case p_filter
             when 'active' then private.subscription_until(u.id) is not null
             when 'inactive' then private.subscription_until(u.id) is null
             when 'blocked' then coalesce(p.blocked, false)
             when 'admin' then coalesce(p.is_admin, false)
             else true end
     order by u.created_at desc
     limit 500;
end;
$$;
grant execute on function public.admin_list_users(text, text) to authenticated;

create function public.admin_find_user(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return (select private.user_json(u.id) from auth.users u where lower(u.email) = lower(btrim(p_email)));
end;
$$;
grant execute on function public.admin_find_user(text) to authenticated;

-- Үнэгүй эрх олгох/сунгах.
create function public.admin_grant(p_user uuid, p_days int default 0, p_months int default 0)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period interval := make_interval(months => greatest(p_months, 0), days => greatest(p_days, 0));
begin
  perform private.require_admin();
  if v_period <= interval '0' or v_period > interval '10 years' then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.grant_subscription(p_user, v_period, 'admin', null, 'Админ олгосон');
  perform private.audit('admin', 'subscription.granted', p_user, jsonb_build_object('days', p_days, 'months', p_months));
  return private.user_json(p_user);
end;
$$;
grant execute on function public.admin_grant(uuid, int, int) to authenticated;

-- Эрхийн дуусах цагийг шууд тохируулна (одоогийн бүх эрхийг тэр цагаар тасална).
create function public.admin_set_end(p_user uuid, p_end timestamptz)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if p_end <= now() then
    raise exception 'invalid_period' using errcode = '22023';
  end if;
  perform private.lock_user(p_user);
  update public.subscriptions set expires_at = now() where user_id = p_user and expires_at > now() and starts_at < now();
  delete from public.subscriptions where user_id = p_user and expires_at > now() and starts_at >= now();
  insert into public.subscriptions (user_id, starts_at, expires_at, source, note, created_by)
  values (p_user, now(), p_end, 'admin', 'Админ тохируулсан', auth.uid());
  perform private.audit('admin', 'subscription.set_end', p_user, jsonb_build_object('end', p_end));
  return private.user_json(p_user);
end;
$$;
grant execute on function public.admin_set_end(uuid, timestamptz) to authenticated;

create function public.admin_cancel(p_user uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform private.lock_user(p_user);
  update public.subscriptions set expires_at = now() where user_id = p_user and expires_at > now() and starts_at < now();
  delete from public.subscriptions where user_id = p_user and expires_at > now() and starts_at >= now();
  perform private.audit('admin', 'subscription.cancelled', p_user, '{}'::jsonb);
  return private.user_json(p_user);
end;
$$;
grant execute on function public.admin_cancel(uuid) to authenticated;

create function public.admin_set_blocked(p_user uuid, p_blocked boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.require_admin() = p_user then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles set blocked = p_blocked where id = p_user;
  perform private.audit('admin', case when p_blocked then 'user.blocked' else 'user.unblocked' end, p_user, '{}'::jsonb);
  return private.user_json(p_user);
end;
$$;
grant execute on function public.admin_set_blocked(uuid, boolean) to authenticated;

create function public.admin_set_role(p_user uuid, p_admin boolean)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if private.require_admin() = p_user then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.profiles set is_admin = p_admin where id = p_user;
  perform private.audit('admin', case when p_admin then 'user.admin_on' else 'user.admin_off' end, p_user, '{}'::jsonb);
  return private.user_json(p_user);
end;
$$;
grant execute on function public.admin_set_role(uuid, boolean) to authenticated;

create function public.admin_list_payments(p_status text default null)
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  perform private.expire_payment_requests();
  return query
    select jsonb_build_object(
      'id', r.id, 'ref_code', r.ref_code, 'status', r.status, 'product', r.product, 'title', p.title,
      'movie_id', r.movie_id, 'movie_title', r.movie_title, 'amount_mnt', r.amount_mnt,
      'user_id', r.user_id, 'email', u.email, 'created_at', r.created_at, 'submitted_at', r.submitted_at,
      'decided_at', r.decided_at, 'reject_reason', r.reject_reason,
      'decided_by', case when r.decided_by_user_id is not null then 'admin'
                         when r.decided_by_telegram_id is not null then 'telegram' end)
      from public.payment_requests r
      join public.products p on p.code = r.product
      join auth.users u on u.id = r.user_id
     where p_status is null or p_status = 'all' or r.status = p_status
     order by (r.status = 'submitted') desc, r.created_at desc
     limit 500;
end;
$$;
grant execute on function public.admin_list_payments(text) to authenticated;

create function public.admin_views()
returns setof jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return query
    select jsonb_build_object('movie_id', v.movie_id, 'count', count(*), 'done', count(*) filter (where v.done),
                              'last', max(v.last_at))
      from public.views v group by v.movie_id;
end;
$$;
grant execute on function public.admin_views() to authenticated;

create function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_month timestamptz := date_trunc('month', now() at time zone 'Asia/Ulaanbaatar') at time zone 'Asia/Ulaanbaatar';
begin
  perform private.require_admin();
  return jsonb_build_object(
    'users', (select count(*) from auth.users),
    'new_users', (select count(*) from auth.users where created_at > now() - interval '30 days'),
    'active', (select count(distinct s.user_id) from public.subscriptions s where s.starts_at <= now() and s.expires_at > now()),
    'renting', (select count(distinct r.user_id) from public.rentals r where r.starts_at <= now() and r.expires_at > now()),
    'blocked', (select count(*) from public.profiles where blocked),
    'admins', (select count(*) from public.profiles where is_admin),
    'pending', (select count(*) from public.payment_requests where status = 'submitted'),
    'month_month', (select coalesce(sum(amount_mnt), 0) from public.payment_requests
                     where status = 'approved' and product = 'month' and decided_at >= v_month),
    'month_rent', (select coalesce(sum(amount_mnt), 0) from public.payment_requests
                    where status = 'approved' and product = 'rent' and decided_at >= v_month),
    'all_month', (select coalesce(sum(amount_mnt), 0) from public.payment_requests where status = 'approved' and product = 'month'),
    'all_rent', (select coalesce(sum(amount_mnt), 0) from public.payment_requests where status = 'approved' and product = 'rent'),
    'recent', coalesce((select jsonb_agg(private.user_json(x.id)) from
                         (select id from auth.users order by created_at desc limit 5) x), '[]'::jsonb)
  );
end;
$$;
grant execute on function public.admin_stats() to authenticated;

-------------------------------------------------------------------------------
-- Realtime: хэрэглэгч өөрийн хүсэлтийн төлөвийг шууд харна (RLS үйлчилнэ).
-------------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.payment_requests;
  end if;
end;
$$;
