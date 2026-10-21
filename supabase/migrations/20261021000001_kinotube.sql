-- KinoTube: хэрэглэгч, үзэх эрх, банкны шилжүүлгээр төлөх, Telegram-аар батлах.
-- Зугаагийн төлбөрийн системийн загвараар (payment_requests → approve_payment).
--
-- Аюулгүй байдал
--  * Бүх хүснэгтэд RLS. Supabase шинэ хүснэгт/функцэд anon, authenticated-д бүх
--    эрх өгдөг тул хасаад, хэрэгтэйг нь л өгнө.
--  * Мөнгө, эрхтэй холбоотой бүх логик SECURITY DEFINER функцэд; хэрэглэгч эдгээр
--    хүснэгт рүү шууд бичихгүй. Үнийг үргэлж products-оос авна.
--  * approve_payment / reject_payment-ийг зөвхөн сервер (service role: Telegram
--    webhook) дуудна.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to anon, authenticated, service_role;

alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon, authenticated;
alter default privileges in schema private revoke execute on functions from public;

create function private.is_service_role()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(auth.jwt() ->> 'role', '') = 'service_role';
$$;
grant execute on function private.is_service_role() to anon, authenticated, service_role;

-- Нэг хэрэглэгчийн төлбөрийн үйлдлүүдийг дараалуулна (зэрэг дарсан ч нэг л удаа).
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

create function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-------------------------------------------------------------------------------
-- products: үзэх эрхийн багцууд. Үнийг энд (Supabase → Table Editor) өөрчилнө.
-------------------------------------------------------------------------------
create table public.products (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null,
  description text,
  price_mnt int not null check (price_mnt > 0),
  duration_days int not null check (duration_days > 0),
  sort_order int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.products enable row level security;
revoke all on table public.products from anon, authenticated;
grant select on table public.products to anon, authenticated;
create policy "products: read active" on public.products for select to anon, authenticated
  using (active);

insert into public.products (code, title, description, price_mnt, duration_days, sort_order) values
  ('kino_1m',  '1 сарын эрх',  'Бүх кино 30 хоног',  9900,  30,  10),
  ('kino_3m',  '3 сарын эрх',  'Бүх кино 90 хоног',  24900, 90,  20),
  ('kino_12m', '1 жилийн эрх', 'Бүх кино 365 хоног', 89000, 365, 30)
on conflict (code) do nothing;

-------------------------------------------------------------------------------
-- payment_requests: банкны шилжүүлгийн хүсэлт (KT-1234).
-------------------------------------------------------------------------------
create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid not null references public.products (id),
  ref_code text not null unique,
  amount_mnt int not null check (amount_mnt > 0),
  status text not null default 'created'
    check (status in ('created', 'submitted', 'approved', 'rejected', 'expired')),
  submitted_at timestamptz,
  decided_at timestamptz,
  decided_by_telegram_id bigint,
  reject_reason text,
  telegram_chat_id bigint,
  telegram_message_id bigint,
  created_at timestamptz not null default now()
);
create index payment_requests_user_idx on public.payment_requests (user_id, created_at desc);
create index payment_requests_open_idx on public.payment_requests (status, created_at)
  where status in ('created', 'submitted');
create index payment_requests_tg_msg_idx on public.payment_requests (telegram_chat_id, telegram_message_id)
  where telegram_message_id is not null;

alter table public.payment_requests enable row level security;
revoke all on table public.payment_requests from anon, authenticated;
grant select on table public.payment_requests to authenticated;
create policy "payment_requests: read own" on public.payment_requests for select to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- subscriptions: батлагдсан төлбөр бүр нэг мөр. Дараалан авбал сунгагдана.
-------------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  product_id uuid references public.products (id),
  starts_at timestamptz not null,
  expires_at timestamptz not null,
  payment_request_id uuid unique references public.payment_requests (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint subscriptions_range check (expires_at > starts_at)
);
create index subscriptions_user_idx on public.subscriptions (user_id, expires_at desc);
alter table public.subscriptions enable row level security;
revoke all on table public.subscriptions from anon, authenticated;
grant select on table public.subscriptions to authenticated;
create policy "subscriptions: read own" on public.subscriptions for select to authenticated
  using (user_id = (select auth.uid()));

-------------------------------------------------------------------------------
-- audit_log: төлбөрийн төлөв бүрийн өөрчлөлт.
-------------------------------------------------------------------------------
create table public.audit_log (
  id bigint generated always as identity primary key,
  actor text not null check (actor in ('user', 'telegram', 'system')),
  actor_user_id uuid references auth.users (id) on delete set null,
  actor_telegram_id bigint,
  action text not null,
  entity_id text,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;
revoke all on table public.audit_log from anon, authenticated;

create function private.audit_payment_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.audit_log (actor, actor_user_id, action, entity_id, data)
    values ('user', new.user_id, 'payment.created', new.id::text,
            jsonb_build_object('ref_code', new.ref_code, 'amount_mnt', new.amount_mnt));
  elsif new.status is distinct from old.status then
    insert into public.audit_log (actor, actor_user_id, actor_telegram_id, action, entity_id, data)
    values (case when new.status = 'expired' then 'system'
                 when new.status in ('approved', 'rejected') then 'telegram'
                 else 'user' end,
            auth.uid(), new.decided_by_telegram_id, 'payment.' || new.status, new.id::text,
            jsonb_build_object('from', old.status, 'to', new.status, 'ref_code', new.ref_code));
  elsif new.reject_reason is distinct from old.reject_reason then
    insert into public.audit_log (actor, actor_telegram_id, action, entity_id, data)
    values ('telegram', new.decided_by_telegram_id, 'payment.reject_reason', new.id::text,
            jsonb_build_object('reject_reason', new.reject_reason));
  end if;
  return new;
end;
$$;
create trigger payment_requests_audit
  after insert or update on public.payment_requests
  for each row execute function private.audit_payment_request();

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
-- Хэрэглэгч: эрх сонгоход хүсэлт үүсгэнэ.
-------------------------------------------------------------------------------
create function public.create_payment_request(p_product_code text)
returns public.payment_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  p public.products%rowtype;
  v_code text;
  v_attempt int := 0;
  v_row public.payment_requests%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  select * into p from public.products where code = p_product_code and active;
  if not found then
    raise exception 'product_not_found' using errcode = 'P0002';
  end if;

  perform private.lock_user(v_uid);
  perform private.expire_payment_requests(v_uid);

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

  insert into public.payment_requests (user_id, product_id, ref_code, amount_mnt)
  values (v_uid, p.id, v_code, p.price_mnt)
  returning * into v_row;
  return v_row;
end;
$$;
grant execute on function public.create_payment_request(text) to authenticated;

-------------------------------------------------------------------------------
-- Хэрэглэгч: "Гүйлгээ хийсэн". created → submitted.
-- needs_notify: админд Telegram мессеж илгээх шаардлагатай эсэх (амжилтгүй
-- болсон бол дахин дарахад дахин илгээнэ).
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
    update public.payment_requests
       set status = 'submitted', submitted_at = now()
     where id = r.id
    returning * into r;
    return jsonb_build_object('status', r.status, 'needs_notify', true);
  end if;

  return jsonb_build_object(
    'status', r.status,
    'needs_notify', r.status = 'submitted' and r.telegram_message_id is null
  );
end;
$$;
grant execute on function public.submit_payment_request(uuid) to authenticated;

-------------------------------------------------------------------------------
-- Админ (Telegram webhook, service role): submitted → approved, эрх олгоно.
-- Давхар дарсан ч нэг л удаа олгоно.
-------------------------------------------------------------------------------
create function public.approve_payment(p_request_id uuid, p_admin_telegram_id bigint default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.payment_requests%rowtype;
  p public.products%rowtype;
  v_start timestamptz;
  v_expires timestamptz;
begin
  if not private.is_service_role() then
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

  select * into p from public.products where id = r.product_id;

  update public.payment_requests
     set status = 'approved', decided_at = now(), decided_by_telegram_id = p_admin_telegram_id
   where id = r.id;

  -- Идэвхтэй эрх байвал түүний дуусах хугацаанаас үргэлжилнэ.
  perform private.lock_user(r.user_id);
  select greatest(now(), coalesce(max(s.expires_at), now())) into v_start
    from public.subscriptions s
   where s.user_id = r.user_id and s.expires_at > now();
  v_expires := v_start + make_interval(days => p.duration_days);
  insert into public.subscriptions (user_id, product_id, starts_at, expires_at, payment_request_id)
  values (r.user_id, p.id, v_start, v_expires, r.id);

  return jsonb_build_object('ok', true, 'already', false, 'status', 'approved', 'ref_code', r.ref_code,
                            'expires_at', v_expires);
end;
$$;
revoke execute on function public.approve_payment(uuid, bigint) from public, anon, authenticated;
grant execute on function public.approve_payment(uuid, bigint) to service_role;

create function public.reject_payment(p_request_id uuid, p_admin_telegram_id bigint default null, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.payment_requests%rowtype;
begin
  if not private.is_service_role() then
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
         reject_reason = nullif(btrim(p_reason), '')
   where id = r.id;
  return jsonb_build_object('ok', true, 'already', false, 'status', 'rejected', 'ref_code', r.ref_code);
end;
$$;
revoke execute on function public.reject_payment(uuid, bigint, text) from public, anon, authenticated;
grant execute on function public.reject_payment(uuid, bigint, text) to service_role;

-- Админ татгалзсан мессежид Telegram-д хариу бичвэл шалтгаан болно.
create function public.set_payment_reject_reason(p_request_id uuid, p_reason text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_service_role() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  update public.payment_requests
     set reject_reason = left(nullif(btrim(p_reason), ''), 500)
   where id = p_request_id and status = 'rejected';
  return found;
end;
$$;
revoke execute on function public.set_payment_reject_reason(uuid, text) from public, anon, authenticated;
grant execute on function public.set_payment_reject_reason(uuid, text) to service_role;

-------------------------------------------------------------------------------
-- Нэвтэрсэн хэрэглэгч: эрх хэзээ хүртэл (дараалан авсан эрхүүдийн төгсгөл), эсвэл null.
-------------------------------------------------------------------------------
create function public.my_access_until()
returns timestamptz
language sql
stable
security definer
set search_path = ''
as $$
  select max(s.expires_at)
    from public.subscriptions s
   where s.user_id = auth.uid()
     and s.expires_at > now()
     and exists (select 1 from public.subscriptions a
                  where a.user_id = auth.uid() and a.starts_at <= now() and a.expires_at > now());
$$;
grant execute on function public.my_access_until() to authenticated;

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
