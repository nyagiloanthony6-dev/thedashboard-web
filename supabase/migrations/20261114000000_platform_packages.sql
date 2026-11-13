-- Serengeti Labs platform admin: choose each shop's package
--   POS only · Store only · POS + Store
-- Only users listed in platform_admins can list shops or change packages.
-- Safe to run more than once.

create table if not exists public.platform_admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.platform_admins enable row level security;
-- No policies: the table is read only through the functions below.

create or replace function public.platform_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- All shops with their current package
create or replace function public.platform_list_shops()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then
    raise exception 'Huna ruhusa ya Serengeti admin';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'phone', to_jsonb(s)->>'phone',
      'subscription', to_jsonb(s)->>'subscription',
      'created_at', to_jsonb(s)->>'created_at',
      -- no pos row = POS on (same rule as the app)
      'pos', coalesce((select m.active and (m.expires_at is null or m.expires_at > now())
                         from public.shop_modules m where m.shop_id = s.id and m.module = 'pos'), true),
      'store', coalesce((select m.active and (m.expires_at is null or m.expires_at > now())
                         from public.shop_modules m where m.shop_id = s.id and m.module = 'kibali'), false)
    ) order by s.name)
    from public.shops s
  ), '[]'::jsonb);
end $$;

-- p_package: 'pos' | 'store' | 'both'
create or replace function public.platform_set_package(p_shop uuid, p_package text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pos boolean; v_store boolean;
begin
  if not public.platform_is_admin() then
    raise exception 'Huna ruhusa ya Serengeti admin';
  end if;
  if p_package not in ('pos', 'store', 'both') then
    raise exception 'Kifurushi si sahihi: %', p_package;
  end if;
  if not exists (select 1 from public.shops where id = p_shop) then
    raise exception 'Duka halipo';
  end if;
  v_pos   := p_package in ('pos', 'both');
  v_store := p_package in ('store', 'both');

  insert into public.shop_modules (shop_id, module, active, expires_at, updated_at)
  values (p_shop, 'pos', v_pos, null, now())
  on conflict (shop_id, module) do update set active = excluded.active, expires_at = null, updated_at = now();

  insert into public.shop_modules (shop_id, module, active, expires_at, updated_at)
  values (p_shop, 'kibali', v_store, null, now())
  on conflict (shop_id, module) do update set active = excluded.active, expires_at = null, updated_at = now();

  return jsonb_build_object('shop_id', p_shop, 'pos', v_pos, 'store', v_store);
end $$;

revoke all on function public.platform_list_shops() from public, anon;
revoke all on function public.platform_set_package(uuid, text) from public, anon;
grant execute on function public.platform_is_admin() to authenticated;
grant execute on function public.platform_list_shops() to authenticated;
grant execute on function public.platform_set_package(uuid, text) to authenticated;

-- Make yourself a platform admin (run once, with your login email):
--   insert into public.platform_admins (user_id)
--   select id from auth.users where email = 'YOUR_LOGIN_EMAIL'
--   on conflict do nothing;
