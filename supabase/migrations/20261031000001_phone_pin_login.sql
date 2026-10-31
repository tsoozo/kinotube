-- Утасны дугаар + 4 оронтой кодоор нэвтрэх (имэйлгүй).
--  * Supabase auth хэрэглэгчид имэйл заавал хэрэгтэй тул сервер (functions/api/auth/) далд имэйл
--    (u-<random>@kinotube.pages.dev) үүсгэнэ. Хэрэглэгчид хэзээ ч харагдахгүй, имэйл илгээгдэхгүй.
--  * Код bcrypt-ээр хадгалагдана. Шалгалтыг зөвхөн сервер (service role) хийнэ, оролдлогын тоо хязгаартай.
--  * Хуучин имэйлээр бүртгүүлсэн хэрэглэгч профайлаас дугаар, код тохируулж болно.

create extension if not exists pgcrypto with schema extensions;

create table private.pin_logins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  phone text not null unique check (phone ~ '^[0-9]{8}$'),
  pin_hash text not null,
  updated_at timestamptz not null default now()
);

-- Далд имэйл эсэх (UI-д харуулахгүй).
create function private.is_hidden_email(p_email text)
returns boolean language sql immutable as $$ select coalesce(p_email like 'u-%@kinotube.pages.dev', false) $$;

create function private.phone_of(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$ select l.phone from private.pin_logins l where l.user_id = p_user $$;

-- Дугаар, код шалгаад хадгална. Дугаар өөр хэрэглэгчийнх бол phone_taken.
create function private.save_pin(p_user uuid, p_phone text, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_phone text := coalesce(nullif(btrim(p_phone), ''), private.phone_of(p_user));
begin
  if v_phone is null or v_phone !~ '^[0-9]{8}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if coalesce(p_pin, '') !~ '^[0-9]{4}$' then
    raise exception 'invalid_pin' using errcode = '22023';
  end if;
  if exists (select 1 from private.pin_logins where phone = v_phone and user_id <> p_user) then
    raise exception 'phone_taken' using errcode = '23505';
  end if;
  insert into private.pin_logins (user_id, phone, pin_hash)
  values (p_user, v_phone, extensions.crypt(p_pin, extensions.gen_salt('bf', 8)))
  on conflict (user_id) do update set phone = excluded.phone, pin_hash = excluded.pin_hash, updated_at = now();
end;
$$;

-- Сервер: дугаар бүртгэлтэй эсэх.
create function public.pin_user_by_phone(p_phone text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$ select l.user_id from private.pin_logins l where l.phone = btrim(p_phone) $$;

-- Сервер: дугаар, код таарвал хэрэглэгчийн id, үгүй бол null.
create function public.pin_login_user(p_phone text, p_pin text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select l.user_id from private.pin_logins l
   where l.phone = btrim(p_phone) and l.pin_hash = extensions.crypt(coalesce(p_pin, ''), l.pin_hash);
$$;

-- Сервер: шинэ хэрэглэгчийн дугаар, код.
create function public.pin_register(p_user uuid, p_phone text, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.save_pin(p_user, p_phone, p_pin);
  perform private.audit('user', 'user.registered', p_user, jsonb_build_object('phone', btrim(p_phone)));
end;
$$;

-- Сервер (Telegram мессеж г.м.): хэрэглэгчийг таних текст — дугаар, эсвэл хуучин имэйл.
create function public.user_contact(p_user uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.phone_of(u.id), case when private.is_hidden_email(u.email) then null else u.email end)
    from auth.users u where u.id = p_user;
$$;

revoke execute on function public.pin_user_by_phone(text) from public, anon, authenticated;
revoke execute on function public.pin_login_user(text, text) from public, anon, authenticated;
revoke execute on function public.pin_register(uuid, text, text) from public, anon, authenticated;
revoke execute on function public.user_contact(uuid) from public, anon, authenticated;
grant execute on function public.pin_user_by_phone(text) to service_role;
grant execute on function public.pin_login_user(text, text) to service_role;
grant execute on function public.pin_register(uuid, text, text) to service_role;
grant execute on function public.user_contact(uuid) to service_role;

-- Нэвтэрсэн хэрэглэгч өөрийн дугаар, кодоо тохируулна/солино.
create function public.set_my_pin(p_phone text, p_pin text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  perform private.save_pin(auth.uid(), p_phone, p_pin);
  perform private.audit('user', 'user.pin_set', auth.uid(), '{}'::jsonb);
end;
$$;
grant execute on function public.set_my_pin(text, text) to authenticated;

-- Админ: кодоо мартсан хэрэглэгчид шинэ код (дугаар хоосон бол хуучнаараа).
create function public.admin_set_pin(p_user uuid, p_phone text, p_pin text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  if not exists (select 1 from auth.users where id = p_user) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  perform private.save_pin(p_user, p_phone, p_pin);
  perform private.audit('admin', 'user.pin_reset', p_user, '{}'::jsonb);
  return private.user_json(p_user);
end;
$$;
grant execute on function public.admin_set_pin(uuid, text, text) to authenticated;

-- Шинэ хэрэглэгчийн нэр далд имэйлээс үүсэхгүй.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_admin)
  values (new.id,
          case when private.is_hidden_email(new.email) then null
               else nullif(split_part(coalesce(new.email, ''), '@', 1), '') end,
          lower(coalesce(new.email, '')) = private.owner_email())
  on conflict (id) do nothing;
  return new;
end;
$$;

-- me(), user_json, admin_list_payments: phone нэмж, далд имэйлийг нууна.
create or replace function public.me()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case when auth.uid() is null then null else jsonb_build_object(
    'id', u.id,
    'email', case when private.is_hidden_email(u.email) then null else u.email end,
    'phone', private.phone_of(u.id),
    'name', coalesce(p.display_name, case when private.is_hidden_email(u.email) then null else split_part(u.email, '@', 1) end),
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

create or replace function private.user_json(p_user uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'email', case when private.is_hidden_email(u.email) then null else u.email end,
    'phone', private.phone_of(u.id),
    'name', coalesce(p.display_name, case when private.is_hidden_email(u.email) then null else split_part(u.email, '@', 1) end),
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

-- Хайлт: дугаар, нэр, хуучин имэйлээр.
create or replace function public.admin_list_users(p_filter text default 'all', p_query text default null)
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
      from auth.users u
      left join public.profiles p on p.id = u.id
      left join private.pin_logins l on l.user_id = u.id
     where (coalesce(btrim(p_query), '') = ''
            or l.phone like '%' || btrim(p_query) || '%'
            or (not private.is_hidden_email(u.email) and u.email ilike '%' || btrim(p_query) || '%')
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

-- Утасны дугаар эсвэл хуучин имэйлээр нэг хэрэглэгч олно.
create or replace function public.admin_find_user(p_email text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  perform private.require_admin();
  return coalesce(
    (select private.user_json(l.user_id) from private.pin_logins l where l.phone = btrim(p_email)),
    (select private.user_json(u.id) from auth.users u
      where not private.is_hidden_email(u.email) and lower(u.email) = lower(btrim(p_email))));
end;
$$;

create or replace function public.admin_list_payments(p_status text default null)
returns setof jsonb
language plpgsql
volatile
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
      'user_id', r.user_id,
      'email', coalesce(private.phone_of(u.id), case when private.is_hidden_email(u.email) then null else u.email end),
      'created_at', r.created_at, 'submitted_at', r.submitted_at,
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
