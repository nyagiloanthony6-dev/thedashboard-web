-- Serengeti Admin: feature switches (tabs) for everyone, with per-shop overrides.
-- Hiding a feature never deletes data. Safe to run more than once.
-- Needs 20261114000000_platform_packages.sql (platform_admins, platform_is_admin).

create table if not exists public.platform_features (
  key        text primary key,
  label      text not null,
  enabled    boolean not null default true,     -- the setting for everyone
  sort       int not null default 100,
  updated_at timestamptz not null default now()
);
create table if not exists public.shop_features (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  key        text not null references public.platform_features(key) on delete cascade,
  enabled    boolean not null,                   -- override for this shop
  updated_at timestamptz not null default now(),
  primary key (shop_id, key)
);
alter table public.platform_features enable row level security;
alter table public.shop_features enable row level security;
-- No policies: read through td_features(), changed through the platform_* functions.

insert into public.platform_features (key, label, enabled, sort) values
  ('sales',        'Sales / POS',               true,  10),
  ('customers',    'Customers',                 true,  20),
  ('expenses',     'Expenses',                  true,  30),
  ('credit',       'Credit',                    true,  40),
  ('loans',        'Loans',                     true,  50),
  ('field_orders', 'Field orders',              true,  60),
  ('reports',      'Reports / Summary',         true,  70),
  ('team',         'Team',                      true,  80),
  ('marketing',    'Marketing (app)',           true,  90),
  ('targets',      'Targets (app)',             true, 100),
  ('reorder',      'Reorder (app)',             true, 110),
  ('whatsapp',     'WhatsApp (web)',            true, 120),
  ('vendors',      'Vendors (web)',             true, 130),
  ('investors',    'Investor fund (web)',       true, 140),
  ('batches',      'Stock batches (web)',       true, 150),
  ('warehouse',    'Central warehouse',         false, 160)
on conflict (key) do update set label = excluded.label, sort = excluded.sort;

-- Effective switches for a shop: shop override, else the setting for everyone.
-- Any signed-in user may read their own shop's switches (they only control what is shown).
create or replace function public.td_features(p_shop uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(f.key, coalesce(sf.enabled, f.enabled)), '{}'::jsonb)
  from public.platform_features f
  left join public.shop_features sf on sf.key = f.key and sf.shop_id = p_shop
$$;

-- Admin view: every feature with its global setting and this shop's override (null = follows everyone)
create or replace function public.platform_list_features(p_shop uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'enabled', f.enabled,
             'override', sf.enabled,
             'overrides', (select count(*) from public.shop_features x where x.key = f.key)) order by f.sort)
    from public.platform_features f
    left join public.shop_features sf on sf.key = f.key and sf.shop_id = p_shop
  ), '[]'::jsonb);
end $$;

create or replace function public.platform_set_feature(p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  update public.platform_features set enabled = p_enabled, updated_at = now() where key = p_key;
  if not found then raise exception 'Kipengele hakipo: %', p_key; end if;
end $$;

-- p_enabled null removes the override (shop follows everyone again)
create or replace function public.platform_set_shop_feature(p_shop uuid, p_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if p_enabled is null then
    delete from public.shop_features where shop_id = p_shop and key = p_key;
  else
    insert into public.shop_features (shop_id, key, enabled, updated_at) values (p_shop, p_key, p_enabled, now())
    on conflict (shop_id, key) do update set enabled = excluded.enabled, updated_at = now();
  end if;
end $$;

revoke all on function public.platform_list_features(uuid) from public, anon;
revoke all on function public.platform_set_feature(text, boolean) from public, anon;
revoke all on function public.platform_set_shop_feature(uuid, text, boolean) from public, anon;
revoke all on function public.td_features(uuid) from public, anon;
grant execute on function public.td_features(uuid) to authenticated;
grant execute on function public.platform_list_features(uuid) to authenticated;
grant execute on function public.platform_set_feature(text, boolean) to authenticated;
grant execute on function public.platform_set_shop_feature(uuid, text, boolean) to authenticated;
