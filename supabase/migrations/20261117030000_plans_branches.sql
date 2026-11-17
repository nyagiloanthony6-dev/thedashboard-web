-- Plans with their own features and shop limit, and branches (multi-shop) for Business Pack.
-- Run after 20261117020000_platform_contacts.sql. Safe to run more than once.
--
-- • A plan lists the features it includes (null = every feature) and how many shops it allows.
-- • A shop's features = per-shop override, else (switch for everyone AND included in the shop's plan).
-- • A branch is a shop with parent_shop_id = the main shop. It follows the main shop's plan
--   and subscription, so one payment covers all branches.
-- • Owners switch branch by moving their current shop (app_users.shop_id); every page, the app
--   and the access rules already follow that pointer.

-- ── Columns ───────────────────────────────────────────────────────────────
alter table public.platform_plans add column if not exists code text;
alter table public.platform_plans add column if not exists features text[];          -- null = all features
alter table public.platform_plans add column if not exists max_shops int not null default 1;
alter table public.platform_plans add column if not exists includes_store boolean not null default false;
alter table public.platform_plans add column if not exists description text;
create unique index if not exists platform_plans_code_key on public.platform_plans (code);

alter table public.shops add column if not exists plan_id uuid references public.platform_plans(id) on delete set null;
alter table public.shops add column if not exists parent_shop_id uuid references public.shops(id) on delete set null;
create index if not exists shops_parent_idx on public.shops (parent_shop_id);

-- Monthly report gets its own switch so Starter can leave it out
insert into public.platform_features (key, label, enabled, sort)
values ('monthly_report', 'Monthly sales report (web)', true, 75)
on conflict (key) do nothing;

-- ── The three POS packs ───────────────────────────────────────────────────
insert into public.platform_plans (code, name, package, monthly_price, sort, features, max_shops, includes_store, description) values
  ('starter',  'Starter Pack',  'pos',  30000, 10,
     array['sales', 'customers', 'expenses', 'field_orders', 'reports', 'team'], 1, false,
     'Mauzo, wateja, matumizi, oda za field, ripoti ya muhtasari na timu'),
  ('standard', 'Standard Pack', 'pos',  50000, 20, null, 1, false,
     'Vipengele vyote vya POS kwa duka moja'),
  ('business', 'Business Pack', 'both', 100000, 30, null, 5, true,
     'Vipengele vyote, matawi hadi 5 na Store')
on conflict (code) do nothing;

-- The first sample plans are replaced by the packs (kept, switched off, for payment history)
update public.platform_plans set active = false
where code is null and name in ('POS', 'Store', 'POS + Store');

-- Link shops to plans they already carry by name
update public.shops s set plan_id = p.id
from public.platform_plans p
where s.plan_id is null and p.name = s.sub_plan;

-- ── Ownership helpers ─────────────────────────────────────────────────────
-- Shops the signed-in user owns: shop_owners rows, plus their own shop if they are its admin
create or replace function public.td_owned_shops()
returns setof uuid language sql stable security definer set search_path = public as $$
  select shop_id from public.shop_owners where user_id = auth.uid()
  union
  select shop_id from public.app_users
  where id = auth.uid() and shop_id is not null and coalesce(role, 'shop_admin') in ('shop_admin', 'super_admin')
$$;

create or replace function public.td_current_shop()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select shop_id from public.app_users where id = auth.uid()),
    (select shop_id from public.shop_owners where user_id = auth.uid() limit 1)
  )
$$;

create or replace function public.td_main_shop(p_shop uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(parent_shop_id, id) from public.shops where id = p_shop
$$;

-- ── Features: override, else everyone's switch AND the plan ───────────────
create or replace function public.td_features(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_feats text[]; v_has_plan boolean := false; v_max int := 1; v_branches boolean;
begin
  select p.features, true, coalesce(p.max_shops, 1) into v_feats, v_has_plan, v_max
  from public.shops s join public.platform_plans p on p.id = s.plan_id
  where s.id = public.td_main_shop(p_shop);
  v_branches := coalesce(v_max, 1) > 1
    or exists (select 1 from public.shops c where c.parent_shop_id = p_shop)
    or exists (select 1 from public.shops c where c.id = p_shop and c.parent_shop_id is not null);
  return coalesce((
    select jsonb_object_agg(f.key, coalesce(sf.enabled,
             f.enabled and (not coalesce(v_has_plan, false) or v_feats is null or f.key = any(v_feats))))
    from public.platform_features f
    left join public.shop_features sf on sf.key = f.key and sf.shop_id = p_shop
  ), '{}'::jsonb) || jsonb_build_object('branches', v_branches);
end $$;

-- Admin view: also shows what the shop's plan allows (plan_on), so overrides make sense
create or replace function public.platform_list_features(p_shop uuid default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_feats text[]; v_plan text; v_has boolean := false;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if p_shop is not null then
    select p.features, p.name, true into v_feats, v_plan, v_has
    from public.shops s join public.platform_plans p on p.id = s.plan_id
    where s.id = public.td_main_shop(p_shop);
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('key', f.key, 'label', f.label, 'enabled', f.enabled,
             'override', sf.enabled,
             'plan', v_plan,
             'plan_on', not coalesce(v_has, false) or v_feats is null or f.key = any(v_feats),
             'overrides', (select count(*) from public.shop_features x where x.key = f.key)) order by f.sort)
    from public.platform_features f
    left join public.shop_features sf on sf.key = f.key and sf.shop_id = p_shop
  ), '[]'::jsonb);
end $$;

-- ── Applying a plan to a shop (and its branches) ──────────────────────────
create or replace function public.td_apply_plan(p_shop uuid, p_plan uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_store boolean;
begin
  select name, includes_store into v_name, v_store from public.platform_plans where id = p_plan;
  if v_name is null then return; end if;
  update public.shops set plan_id = p_plan, sub_plan = v_name where id = p_shop;
  if v_store then
    insert into public.shop_modules (shop_id, module, active, expires_at, updated_at)
    select s.id, 'kibali', true, null, now() from public.shops s where s.id = p_shop or s.parent_shop_id = p_shop
    on conflict (shop_id, module) do update set active = true, expires_at = null, updated_at = now();
  end if;
end $$;
revoke all on function public.td_apply_plan(uuid, uuid) from public, anon, authenticated;

-- Branches follow the main shop's plan and subscription
create or replace function public.td_branch_sync()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.parent_shop_id is null and (
       new.plan_id is distinct from old.plan_id or new.sub_plan is distinct from old.sub_plan
    or new.subscription is distinct from old.subscription or new.sub_expires_at is distinct from old.sub_expires_at) then
    update public.shops set plan_id = new.plan_id, sub_plan = new.sub_plan,
      subscription = new.subscription, sub_expires_at = new.sub_expires_at
    where parent_shop_id = new.id;
  end if;
  return new;
end $$;
drop trigger if exists td_branch_sync on public.shops;
create trigger td_branch_sync after update on public.shops
  for each row execute function public.td_branch_sync();

-- ── Admin functions that now set the plan ─────────────────────────────────
-- p_plan is the plan name (as before); it also links plan_id and applies the plan
create or replace function public.platform_set_subscription(p_shop uuid, p_status text, p_plan text default null, p_expires timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_plan uuid;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if p_status not in ('active', 'trial', 'suspended') then raise exception 'Hali si sahihi: %', p_status; end if;
  if exists (select 1 from public.shops where id = p_shop and parent_shop_id is not null) then
    raise exception 'Hili ni tawi: badilisha usajili wa duka kuu';
  end if;
  update public.shops set subscription = p_status,
    sub_plan = coalesce(p_plan, sub_plan),
    sub_expires_at = coalesce(p_expires, sub_expires_at)
  where id = p_shop;
  if not found then raise exception 'Duka halipo'; end if;
  if p_plan is not null then
    select id into v_plan from public.platform_plans where name = p_plan order by active desc limit 1;
    if v_plan is not null then perform public.td_apply_plan(p_shop, v_plan);
    else update public.shops set plan_id = null where id = p_shop; end if;
  end if;
end $$;

create or replace function public.platform_record_payment(p_shop uuid, p_amount numeric, p_paid_at date, p_method text,
  p_reference text, p_months int, p_plan uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_exp timestamptz;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Kiasi si sahihi'; end if;
  if not exists (select 1 from public.shops where id = p_shop) then raise exception 'Duka halipo'; end if;
  if exists (select 1 from public.shops where id = p_shop and parent_shop_id is not null) then
    raise exception 'Hili ni tawi: rekodi malipo kwenye duka kuu';
  end if;
  insert into public.shop_payments (shop_id, amount, paid_at, method, reference, months, plan_id, note)
  values (p_shop, p_amount, coalesce(p_paid_at, current_date), coalesce(nullif(p_method, ''), 'mpesa'), nullif(p_reference, ''), coalesce(p_months, 0), p_plan, nullif(p_note, ''))
  returning id into v_id;
  if coalesce(p_months, 0) > 0 then
    update public.shops set
      sub_expires_at = greatest(coalesce(sub_expires_at, now()), now()) + make_interval(months => p_months),
      subscription = 'active'
    where id = p_shop returning sub_expires_at into v_exp;
    if p_plan is not null then perform public.td_apply_plan(p_shop, p_plan); end if;
  end if;
  return jsonb_build_object('id', v_id, 'sub_expires_at', v_exp);
end $$;

drop function if exists public.platform_save_plan(uuid, text, text, numeric, boolean);
create or replace function public.platform_save_plan(p_id uuid, p_name text, p_package text, p_price numeric, p_active boolean,
  p_features text[] default null, p_max_shops int default 1, p_includes_store boolean default false, p_description text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Andika jina la mpango'; end if;
  if coalesce(p_max_shops, 1) < 1 or p_max_shops > 100 then raise exception 'Idadi ya maduka si sahihi'; end if;
  if p_id is null then
    insert into public.platform_plans (name, package, monthly_price, active, features, max_shops, includes_store, description)
    values (trim(p_name), p_package, coalesce(p_price, 0), coalesce(p_active, true), p_features, coalesce(p_max_shops, 1), coalesce(p_includes_store, false), nullif(trim(p_description), ''))
    returning id into v;
  else
    update public.platform_plans set name = trim(p_name), package = p_package, monthly_price = coalesce(p_price, 0),
      active = coalesce(p_active, true), features = p_features, max_shops = coalesce(p_max_shops, 1),
      includes_store = coalesce(p_includes_store, false), description = nullif(trim(p_description), '')
    where id = p_id returning id into v;
    -- keep the plan name on shops in step
    update public.shops set sub_plan = trim(p_name) where plan_id = p_id;
  end if;
  return v;
end $$;

-- Shops list: plan_id, parent (branch of …), branch count
create or replace function public.platform_list_shops()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name,
      'phone', to_jsonb(s)->>'phone',
      'address', to_jsonb(s)->>'address',
      'subscription', to_jsonb(s)->>'subscription',
      'sub_plan', to_jsonb(s)->>'sub_plan',
      'plan_id', s.plan_id,
      'parent_id', s.parent_shop_id,
      'parent_name', (select m.name from public.shops m where m.id = s.parent_shop_id),
      'branches', (select count(*) from public.shops c where c.parent_shop_id = s.id),
      'sub_expires_at', to_jsonb(s)->>'sub_expires_at',
      'trial_started_at', to_jsonb(s)->>'trial_started_at',
      'created_at', to_jsonb(s)->>'created_at',
      'status', public.td_sub_status(to_jsonb(s)->>'subscription', (to_jsonb(s)->>'sub_expires_at')::timestamptz),
      'pos', public.td_package(s.id) in ('pos', 'both'),
      'store', public.td_package(s.id) in ('store', 'both'),
      'owner', coalesce(o.full_name, o.email),
      'owner_name', o.full_name,
      'owner_phone', o.phone,
      'owner_email', o.email,
      'sales_30d', (select count(*) from public.sales x where x.shop_id = s.id and x.created_at > now() - interval '30 days'),
      'revenue_30d', (select coalesce(sum((to_jsonb(x)->>'total')::numeric), 0) from public.sales x where x.shop_id = s.id and x.created_at > now() - interval '30 days'),
      'last_sale_at', (select max(x.created_at) from public.sales x where x.shop_id = s.id),
      'paid_total', (select coalesce(sum(p.amount), 0) from public.shop_payments p where p.shop_id = s.id and not p.voided)
    ) order by s.name)
    from public.shops s
    left join lateral (
      select u.full_name, u.email, to_jsonb(u)->>'phone' as phone
      from public.app_users u
      where u.id in (select so.user_id from public.shop_owners so where so.shop_id = coalesce(s.parent_shop_id, s.id))
         or (u.shop_id = s.id and u.role in ('shop_admin', 'super_admin'))
      order by (u.id in (select so.user_id from public.shop_owners so where so.shop_id = coalesce(s.parent_shop_id, s.id))) desc, u.role
      limit 1
    ) o on true
  ), '[]'::jsonb);
end $$;

-- Expected monthly income: main shops only (one Business payment covers its branches)
create or replace function public.platform_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  with st as (
    select s.id, public.td_sub_status(to_jsonb(s)->>'subscription', (to_jsonb(s)->>'sub_expires_at')::timestamptz) status,
           public.td_package(s.id) pkg, (to_jsonb(s)->>'created_at')::timestamptz created_at,
           (to_jsonb(s)->>'sub_expires_at')::timestamptz expires, to_jsonb(s)->>'sub_plan' plan, s.plan_id, s.parent_shop_id
    from public.shops s
  ), months as (
    select generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m
  )
  select jsonb_build_object(
    'shops', (select count(*) from st),
    'by_status', (select jsonb_object_agg(status, n) from (select status, count(*) n from st group by status) x),
    'by_package', (select jsonb_object_agg(pkg, n) from (select pkg, count(*) n from st group by pkg) x),
    'by_plan', (select jsonb_object_agg(coalesce(pl.name, '—'), n) from (select plan_id, count(*) n from st where parent_shop_id is null and status = 'active' group by plan_id) x left join public.platform_plans pl on pl.id = x.plan_id),
    'ending_7d', (select count(*) from st where parent_shop_id is null and status in ('trial', 'active') and expires between now() and now() + interval '7 days'),
    'signups', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                 'n', (select count(*) from st where st.parent_shop_id is null and date_trunc('month', st.created_at) = months.m)) order by m) from months),
    'income', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                 'amount', (select coalesce(sum(p.amount), 0) from public.shop_payments p where not p.voided and date_trunc('month', p.paid_at) = months.m)) order by m) from months),
    'income_month', (select coalesce(sum(amount), 0) from public.shop_payments where not voided and paid_at >= date_trunc('month', now())),
    'expected_monthly', (select coalesce(sum(pl.monthly_price), 0) from st
                          join public.platform_plans pl on pl.id = coalesce(st.plan_id, (select id from public.platform_plans p2 where p2.name = st.plan limit 1))
                          where st.status = 'active' and st.parent_shop_id is null),
    'active_30d', (select count(distinct x.shop_id) from public.sales x where x.created_at > now() - interval '30 days')
  ) into r;
  return r;
end $$;

-- ── Branches for owners ───────────────────────────────────────────────────
-- The owner's shops in the current group, with figures for the combined view
create or replace function public.td_my_branches()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_cur uuid := public.td_current_shop(); v_main uuid; v_max int; v_plan text; v_today timestamptz;
begin
  if auth.uid() is null or v_cur is null then return null; end if;
  v_main := public.td_main_shop(v_cur);
  select coalesce(p.max_shops, 1), s.sub_plan into v_max, v_plan
  from public.shops s left join public.platform_plans p on p.id = s.plan_id where s.id = v_main;
  v_today := date_trunc('day', now() at time zone 'Africa/Dar_es_Salaam') at time zone 'Africa/Dar_es_Salaam';
  return jsonb_build_object(
    'current', v_cur, 'main', v_main, 'max_shops', coalesce(v_max, 1), 'plan', v_plan,
    'count', (select count(*) from public.shops where id = v_main or parent_shop_id = v_main),
    'is_owner', v_main in (select public.td_owned_shops()),
    'shops', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'name', s.name, 'address', to_jsonb(s)->>'address', 'phone', to_jsonb(s)->>'phone',
        'is_main', s.id = v_main, 'is_current', s.id = v_cur,
        'today', (select coalesce(sum((to_jsonb(x)->>'total')::numeric), 0) from public.sales x where x.shop_id = s.id and x.created_at >= v_today),
        'today_n', (select count(*) from public.sales x where x.shop_id = s.id and x.created_at >= v_today),
        'd7', (select coalesce(sum((to_jsonb(x)->>'total')::numeric), 0) from public.sales x where x.shop_id = s.id and x.created_at >= v_today - interval '6 days'),
        'd30', (select coalesce(sum((to_jsonb(x)->>'total')::numeric), 0) from public.sales x where x.shop_id = s.id and x.created_at >= v_today - interval '29 days'),
        'last_sale_at', (select max(x.created_at) from public.sales x where x.shop_id = s.id),
        'staff', (select count(*) from public.app_users u where u.shop_id = s.id and coalesce(u.role, '') not in ('shop_admin', 'super_admin'))
      ) order by (s.id = v_main) desc, s.name)
      from public.shops s
      where (s.id = v_main or s.parent_shop_id = v_main) and s.id in (select public.td_owned_shops())
    ), '[]'::jsonb)
  );
end $$;

-- Move the owner's current shop (every page and the app follow it)
create or replace function public.td_switch_shop(p_shop uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_cur uuid := public.td_current_shop();
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_shop is null or p_shop not in (select public.td_owned_shops()) then raise exception 'You do not own this shop'; end if;
  if p_shop = v_cur then return; end if;
  -- remember the shop being left, so the owner can always come back to it
  if v_cur is not null and v_cur in (select public.td_owned_shops())
     and not exists (select 1 from public.shop_owners where user_id = auth.uid() and shop_id = v_cur) then
    insert into public.shop_owners (user_id, shop_id) values (auth.uid(), v_cur);
  end if;
  update public.app_users set shop_id = p_shop where id = auth.uid();
  if not found then raise exception 'Profile not found'; end if;
end $$;

-- Add a branch, within the plan's shop limit
create or replace function public.td_create_branch(p_name text, p_phone text default null, p_address text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_cur uuid := public.td_current_shop(); v_main uuid; v_max int; v_count int; v_new uuid; m record;
begin
  if auth.uid() is null or v_cur is null then raise exception 'Not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Enter the branch name'; end if;
  v_main := public.td_main_shop(v_cur);
  if v_main not in (select public.td_owned_shops()) then raise exception 'Only the owner can add branches'; end if;
  select coalesce(p.max_shops, 1) into v_max from public.shops s left join public.platform_plans p on p.id = s.plan_id where s.id = v_main;
  select count(*) into v_count from public.shops where id = v_main or parent_shop_id = v_main;
  if v_count >= coalesce(v_max, 1) then
    if coalesce(v_max, 1) > 1 then raise exception 'Your plan allows up to % shops.', v_max; end if;
    raise exception 'Your plan has one shop. Upgrade to Business Pack to add branches.';
  end if;

  select * into m from public.shops where id = v_main;
  insert into public.shops (name, phone, address, parent_shop_id, subscription, sub_plan, trial_started_at)
  values (trim(p_name), nullif(trim(p_phone), ''), nullif(trim(p_address), ''), v_main, m.subscription, m.sub_plan, now())
  returning id into v_new;
  -- same plan, subscription and sale mode as the main shop
  update public.shops set plan_id = m.plan_id, subscription = m.subscription, sub_expires_at = m.sub_expires_at,
    sale_mode = m.sale_mode
  where id = v_new;

  insert into public.shop_owners (user_id, shop_id)
  select auth.uid(), x from unnest(array[v_main, v_new]) x
  where not exists (select 1 from public.shop_owners so where so.user_id = auth.uid() and so.shop_id = x);

  insert into public.shop_modules (shop_id, module, active, expires_at, updated_at)
  select v_new, module, active, expires_at, now() from public.shop_modules where shop_id = v_main
  on conflict (shop_id, module) do nothing;
  return v_new;
end $$;

-- ── Grants ────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'td_owned_shops()', 'td_current_shop()', 'td_main_shop(uuid)', 'td_my_branches()', 'td_switch_shop(uuid)', 'td_create_branch(text, text, text)',
    'td_features(uuid)', 'platform_list_features(uuid)', 'platform_set_subscription(uuid, text, text, timestamptz)',
    'platform_record_payment(uuid, numeric, date, text, text, integer, uuid, text)',
    'platform_save_plan(uuid, text, text, numeric, boolean, text[], integer, boolean, text)',
    'platform_list_shops()', 'platform_stats()'] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
