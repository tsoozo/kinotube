-- Админы хэрэглэгчийн жагсаалтад нэг кино түрээсийг харуулна:
-- 'rentals' тооны оронд кино бүрийн сүүлийн түрээс (нэр, дуусах хугацаа, идэвхтэй эсэх).
-- "Эрхтэй" шүүлтүүрт идэвхтэй түрээстэй хэрэглэгч ч орно.
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
    'rentals', coalesce((select jsonb_agg(jsonb_build_object('id', x.movie_id, 'title', x.movie_title,
                                                             'endsAt', x.ends_at, 'active', x.active)
                                          order by x.active desc, x.ends_at desc)
                           from (select r.movie_id, max(r.movie_title) as movie_title, max(r.expires_at) as ends_at,
                                        private.rental_until(u.id, r.movie_id) is not null as active
                                   from public.rentals r
                                  where r.user_id = u.id
                                  group by r.movie_id
                                  order by max(r.expires_at) desc
                                  limit 20) x), '[]'::jsonb),
    'views', (select count(*) from public.views v where v.user_id = u.id),
    'paid_mnt', (select coalesce(sum(r.amount_mnt), 0) from public.payment_requests r
                  where r.user_id = u.id and r.status = 'approved'))
  from auth.users u left join public.profiles p on p.id = u.id
  where u.id = p_user;
$$;

create or replace function private.has_rental(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.rentals r
                  where r.user_id = p_user and r.starts_at <= now() and r.expires_at > now());
$$;

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
             when 'active' then private.subscription_until(u.id) is not null or private.has_rental(u.id)
             when 'inactive' then private.subscription_until(u.id) is null and not private.has_rental(u.id)
             when 'blocked' then coalesce(p.blocked, false)
             when 'admin' then coalesce(p.is_admin, false)
             else true end
     order by u.created_at desc
     limit 500;
end;
$$;
