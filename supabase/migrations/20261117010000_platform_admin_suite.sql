-- Serengeti Admin: subscriptions, payments, analytics, notices, settings, admin users.
-- Payments are recorded here; invoices stay in the Serengeti billing admin.
-- Needs 20261114000000_platform_packages.sql (platform_admins, platform_is_admin).
-- Safe to run more than once.

-- ── Settings ──────────────────────────────────────────────────────────────
create table if not exists public.platform_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_settings enable row level security;
insert into public.platform_settings (key, value) values ('trial_days', '14'::jsonb) on conflict (key) do nothing;

-- ── Plans (prices used when activating / recording payments) ──────────────
create table if not exists public.platform_plans (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  package    text not null default 'pos' check (package in ('pos', 'store', 'both')),
  monthly_price numeric not null default 0,
  active     boolean not null default true,
  sort       int not null default 100,
  created_at timestamptz not null default now()
);
alter table public.platform_plans enable row level security;
insert into public.platform_plans (name, package, monthly_price, sort)
select * from (values ('POS', 'pos', 0::numeric, 10), ('Store', 'store', 0::numeric, 20), ('POS + Store', 'both', 0::numeric, 30)) v(n, p, m, s)
where not exists (select 1 from public.platform_plans);

-- ── Payments (recorded by Serengeti; extends the subscription) ────────────
create table if not exists public.shop_payments (
  id         uuid primary key default gen_random_uuid(),
  shop_id    uuid not null references public.shops(id) on delete cascade,
  amount     numeric not null check (amount >= 0),
  paid_at    date not null default current_date,
  method     text not null default 'mpesa',
  reference  text,
  months     int not null default 1 check (months between 0 and 60),
  plan_id    uuid references public.platform_plans(id) on delete set null,
  note       text,
  voided     boolean not null default false,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists shop_payments_shop_idx on public.shop_payments (shop_id, paid_at desc);
alter table public.shop_payments enable row level security;

-- ── Notices (messages to shops) ───────────────────────────────────────────
create table if not exists public.platform_notices (
  id         uuid primary key default gen_random_uuid(),
  title      text not null,
  body       text,
  level      text not null default 'info' check (level in ('info', 'warning')),
  target     text not null default 'all' check (target in ('all', 'pos', 'store', 'both', 'shop')),
  shop_id    uuid references public.shops(id) on delete cascade,
  ends_at    timestamptz,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.notice_dismissals (
  notice_id  text not null,           -- uuid of a notice, or 'sub:<shop>:<expiry date>' for reminders
  user_id    uuid not null,
  dismissed_at timestamptz not null default now(),
  primary key (notice_id, user_id)
);
alter table public.platform_notices enable row level security;
alter table public.notice_dismissals enable row level security;

-- ── Trial length from settings for new sign-ups ───────────────────────────
create or replace function public.td_trial_from_settings()
returns trigger language plpgsql security definer set search_path = public as $$
declare d int;
begin
  if coalesce(new.subscription, 'trial') = 'trial' then
    select (value #>> '{}')::int into d from public.platform_settings where key = 'trial_days';
    new.trial_started_at := coalesce(new.trial_started_at, now());
    new.sub_expires_at := new.trial_started_at + make_interval(days => coalesce(d, 14));
  end if;
  return new;
end $$;
drop trigger if exists td_trial_from_settings on public.shops;
create trigger td_trial_from_settings before insert on public.shops
  for each row execute function public.td_trial_from_settings();

-- Helper: the shop's package (no pos row = POS on)
create or replace function public.td_package(p_shop uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when pos and store then 'both' when store then 'store' else 'pos' end
  from (select
    coalesce((select m.active and (m.expires_at is null or m.expires_at > now()) from public.shop_modules m where m.shop_id = p_shop and m.module = 'pos'), true) as pos,
    coalesce((select m.active and (m.expires_at is null or m.expires_at > now()) from public.shop_modules m where m.shop_id = p_shop and m.module = 'kibali'), false) as store) x
$$;

-- Subscription status shown everywhere: suspended / expired / trial / active
create or replace function public.td_sub_status(p_sub text, p_expires timestamptz)
returns text language sql immutable as $$
  select case when p_sub = 'suspended' then 'suspended'
              when p_expires is not null and p_expires < now() then 'expired'
              when p_sub = 'trial' then 'trial' else 'active' end
$$;

-- ── Shops list for the admin (now with subscription + activity) ───────────
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
      'sub_expires_at', to_jsonb(s)->>'sub_expires_at',
      'trial_started_at', to_jsonb(s)->>'trial_started_at',
      'created_at', to_jsonb(s)->>'created_at',
      'status', public.td_sub_status(to_jsonb(s)->>'subscription', (to_jsonb(s)->>'sub_expires_at')::timestamptz),
      'pos', public.td_package(s.id) in ('pos', 'both'),
      'store', public.td_package(s.id) in ('store', 'both'),
      'owner', (select coalesce(u.full_name, u.email) from public.app_users u where u.shop_id = s.id and u.role in ('shop_admin', 'super_admin') order by u.role limit 1),
      'sales_30d', (select count(*) from public.sales x where x.shop_id = s.id and x.created_at > now() - interval '30 days'),
      'revenue_30d', (select coalesce(sum((to_jsonb(x)->>'total')::numeric), 0) from public.sales x where x.shop_id = s.id and x.created_at > now() - interval '30 days'),
      'last_sale_at', (select max(x.created_at) from public.sales x where x.shop_id = s.id),
      'paid_total', (select coalesce(sum(p.amount), 0) from public.shop_payments p where p.shop_id = s.id and not p.voided)
    ) order by s.name)
    from public.shops s
  ), '[]'::jsonb);
end $$;

-- ── Subscriptions ─────────────────────────────────────────────────────────
-- p_status: active | trial | suspended ; p_expires null keeps the current date
create or replace function public.platform_set_subscription(p_shop uuid, p_status text, p_plan text default null, p_expires timestamptz default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if p_status not in ('active', 'trial', 'suspended') then raise exception 'Hali si sahihi: %', p_status; end if;
  update public.shops set subscription = p_status,
    sub_plan = coalesce(p_plan, sub_plan),
    sub_expires_at = coalesce(p_expires, sub_expires_at)
  where id = p_shop;
  if not found then raise exception 'Duka halipo'; end if;
end $$;

-- Extend from the later of today or the current expiry
create or replace function public.platform_extend(p_shop uuid, p_months int)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v timestamptz;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if p_months is null or p_months < 1 or p_months > 60 then raise exception 'Miezi si sahihi'; end if;
  update public.shops set
    sub_expires_at = greatest(coalesce(sub_expires_at, now()), now()) + make_interval(months => p_months),
    subscription = case when subscription = 'suspended' then subscription else 'active' end
  where id = p_shop returning sub_expires_at into v;
  if not found then raise exception 'Duka halipo'; end if;
  return v;
end $$;

-- ── Payments ──────────────────────────────────────────────────────────────
create or replace function public.platform_record_payment(p_shop uuid, p_amount numeric, p_paid_at date, p_method text,
  p_reference text, p_months int, p_plan uuid default null, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_exp timestamptz; v_plan text;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if p_amount is null or p_amount < 0 then raise exception 'Kiasi si sahihi'; end if;
  insert into public.shop_payments (shop_id, amount, paid_at, method, reference, months, plan_id, note)
  values (p_shop, p_amount, coalesce(p_paid_at, current_date), coalesce(nullif(p_method, ''), 'mpesa'), nullif(p_reference, ''), coalesce(p_months, 0), p_plan, nullif(p_note, ''))
  returning id into v_id;
  select name into v_plan from public.platform_plans where id = p_plan;
  if coalesce(p_months, 0) > 0 then
    update public.shops set
      sub_expires_at = greatest(coalesce(sub_expires_at, now()), now()) + make_interval(months => p_months),
      subscription = 'active', sub_plan = coalesce(v_plan, sub_plan)
    where id = p_shop returning sub_expires_at into v_exp;
  end if;
  return jsonb_build_object('id', v_id, 'sub_expires_at', v_exp);
end $$;

-- Void a mistaken payment (kept for history; does not change the expiry date)
create or replace function public.platform_void_payment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  update public.shop_payments set voided = true where id = p_id;
end $$;

create or replace function public.platform_list_payments(p_shop uuid default null, p_from date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', p.id, 'shop_id', p.shop_id, 'shop', s.name, 'amount', p.amount, 'paid_at', p.paid_at,
      'method', p.method, 'reference', p.reference, 'months', p.months, 'plan', pl.name, 'note', p.note, 'voided', p.voided,
      'created_at', p.created_at) order by p.paid_at desc, p.created_at desc)
    from public.shop_payments p join public.shops s on s.id = p.shop_id
    left join public.platform_plans pl on pl.id = p.plan_id
    where (p_shop is null or p.shop_id = p_shop) and (p_from is null or p.paid_at >= p_from)
  ), '[]'::jsonb);
end $$;

-- ── Analytics ─────────────────────────────────────────────────────────────
create or replace function public.platform_stats()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  with st as (
    select s.id, public.td_sub_status(to_jsonb(s)->>'subscription', (to_jsonb(s)->>'sub_expires_at')::timestamptz) status,
           public.td_package(s.id) pkg, (to_jsonb(s)->>'created_at')::timestamptz created_at,
           (to_jsonb(s)->>'sub_expires_at')::timestamptz expires, to_jsonb(s)->>'sub_plan' plan
    from public.shops s
  ), months as (
    select generate_series(date_trunc('month', now()) - interval '11 months', date_trunc('month', now()), interval '1 month') m
  )
  select jsonb_build_object(
    'shops', (select count(*) from st),
    'by_status', (select jsonb_object_agg(status, n) from (select status, count(*) n from st group by status) x),
    'by_package', (select jsonb_object_agg(pkg, n) from (select pkg, count(*) n from st group by pkg) x),
    'ending_7d', (select count(*) from st where status in ('trial', 'active') and expires between now() and now() + interval '7 days'),
    'signups', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                 'n', (select count(*) from st where date_trunc('month', st.created_at) = months.m)) order by m) from months),
    'income', (select jsonb_agg(jsonb_build_object('month', to_char(m, 'YYYY-MM'),
                 'amount', (select coalesce(sum(p.amount), 0) from public.shop_payments p where not p.voided and date_trunc('month', p.paid_at) = months.m)) order by m) from months),
    'income_month', (select coalesce(sum(amount), 0) from public.shop_payments where not voided and paid_at >= date_trunc('month', now())),
    'expected_monthly', (select coalesce(sum(pl.monthly_price), 0) from st join public.platform_plans pl on pl.name = st.plan and pl.active where st.status = 'active'),
    'active_30d', (select count(distinct x.shop_id) from public.sales x where x.created_at > now() - interval '30 days')
  ) into r;
  return r;
end $$;

-- ── Plans and settings ────────────────────────────────────────────────────
create or replace function public.platform_list_plans()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  return coalesce((select jsonb_agg(to_jsonb(p) order by p.sort, p.name) from public.platform_plans p), '[]'::jsonb);
end $$;

create or replace function public.platform_save_plan(p_id uuid, p_name text, p_package text, p_price numeric, p_active boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Andika jina la mpango'; end if;
  if p_id is null then
    insert into public.platform_plans (name, package, monthly_price, active) values (trim(p_name), p_package, coalesce(p_price, 0), coalesce(p_active, true)) returning id into v;
  else
    update public.platform_plans set name = trim(p_name), package = p_package, monthly_price = coalesce(p_price, 0), active = coalesce(p_active, true) where id = p_id returning id into v;
  end if;
  return v;
end $$;

create or replace function public.platform_get_settings()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  return coalesce((select jsonb_object_agg(key, value) from public.platform_settings), '{}'::jsonb);
end $$;

create or replace function public.platform_set_setting(p_key text, p_value jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  insert into public.platform_settings (key, value, updated_at) values (p_key, p_value, now())
  on conflict (key) do update set value = excluded.value, updated_at = now();
end $$;

-- ── Admin users ───────────────────────────────────────────────────────────
create or replace function public.platform_list_admins()
returns jsonb language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('user_id', a.user_id, 'email', u.email, 'added', a.created_at, 'me', a.user_id = auth.uid()) order by a.created_at)
    from public.platform_admins a join auth.users u on u.id = a.user_id), '[]'::jsonb);
end $$;

create or replace function public.platform_add_admin(p_email text)
returns void language plpgsql security definer set search_path = public, auth as $$
declare v uuid;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  select id into v from auth.users where lower(email) = lower(trim(p_email));
  if v is null then raise exception 'Hakuna akaunti yenye email hii. Itengeneze kwanza (Supabase → Authentication).'; end if;
  insert into public.platform_admins (user_id) values (v) on conflict do nothing;
end $$;

create or replace function public.platform_remove_admin(p_user uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if p_user = auth.uid() then raise exception 'Huwezi kujiondoa mwenyewe'; end if;
  delete from public.platform_admins where user_id = p_user;
end $$;

-- ── Notices: admin side ───────────────────────────────────────────────────
create or replace function public.platform_list_notices()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'title', n.title, 'body', n.body, 'level', n.level, 'target', n.target,
      'shop_id', n.shop_id, 'shop', s.name, 'ends_at', n.ends_at, 'active', n.active and (n.ends_at is null or n.ends_at > now()),
      'created_at', n.created_at, 'dismissed', (select count(*) from public.notice_dismissals d where d.notice_id = n.id::text)) order by n.created_at desc)
    from public.platform_notices n left join public.shops s on s.id = n.shop_id), '[]'::jsonb);
end $$;

create or replace function public.platform_save_notice(p_title text, p_body text, p_level text, p_target text, p_shop uuid, p_ends_at timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  if coalesce(trim(p_title), '') = '' then raise exception 'Andika kichwa cha ujumbe'; end if;
  if p_target = 'shop' and p_shop is null then raise exception 'Chagua duka'; end if;
  insert into public.platform_notices (title, body, level, target, shop_id, ends_at)
  values (trim(p_title), nullif(trim(p_body), ''), coalesce(p_level, 'info'), coalesce(p_target, 'all'), case when p_target = 'shop' then p_shop end, p_ends_at)
  returning id into v;
  return v;
end $$;

create or replace function public.platform_end_notice(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  update public.platform_notices set active = false where id = p_id;
end $$;

-- ── Notices: shop side (web + app banner) ─────────────────────────────────
-- Active messages for this shop, plus automatic reminders when the subscription
-- ends within 7 days or has ended. Dismissed items are left out for this user.
create or replace function public.td_my_notices(p_shop uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare pkg text; s record; out jsonb := '[]'::jsonb; rid text;
begin
  if p_shop is null or not public.td_can_shop(p_shop) then return '[]'::jsonb; end if;
  pkg := public.td_package(p_shop);
  select to_jsonb(x)->>'subscription' sub, (to_jsonb(x)->>'sub_expires_at')::timestamptz exp into s from public.shops x where x.id = p_shop;
  if s.exp is not null and s.sub <> 'suspended' and s.exp < now() + interval '7 days' then
    rid := 'sub:' || p_shop || ':' || to_char(s.exp, 'YYYY-MM-DD') || ':' || (case when s.exp < now() then 'x' when s.exp < now() + interval '1 day' then '1' else '7' end);
    if not exists (select 1 from public.notice_dismissals d where d.notice_id = rid and d.user_id = auth.uid()) then
      out := out || jsonb_build_array(jsonb_build_object('id', rid, 'level', 'warning',
        'title', case when s.exp < now() then 'Usajili wako umeisha' when s.sub = 'trial' then 'Kipindi cha majaribio kinaisha' else 'Usajili unaisha karibuni' end,
        'body', case when s.exp < now() then 'Wasiliana na Serengeti Labs (+255 754 711 063) kulipia na kuendelea kutumia TheDashboard.'
                     else 'Unaisha tarehe ' || to_char(s.exp, 'DD/MM/YYYY') || '. Lipia mapema kuepuka kukatizwa: +255 754 711 063.' end));
    end if;
  end if;
  out := out || coalesce((select jsonb_agg(jsonb_build_object('id', n.id, 'level', n.level, 'title', n.title, 'body', n.body) order by n.created_at desc)
    from public.platform_notices n
    where n.active and (n.ends_at is null or n.ends_at > now())
      and (n.target = 'all' or n.target = pkg or (n.target = 'shop' and n.shop_id = p_shop)
           or (n.target = 'pos' and pkg = 'both') or (n.target = 'store' and pkg = 'both'))
      and not exists (select 1 from public.notice_dismissals d where d.notice_id = n.id::text and d.user_id = auth.uid())), '[]'::jsonb);
  return out;
end $$;

create or replace function public.td_dismiss_notice(p_id text)
returns void language sql security definer set search_path = public as $$
  insert into public.notice_dismissals (notice_id, user_id) values (p_id, auth.uid()) on conflict do nothing
$$;

-- ── Grants ────────────────────────────────────────────────────────────────
do $$
declare f text;
begin
  foreach f in array array[
    'platform_set_subscription(uuid,text,text,timestamptz)', 'platform_extend(uuid,int)',
    'platform_record_payment(uuid,numeric,date,text,text,int,uuid,text)', 'platform_void_payment(uuid)', 'platform_list_payments(uuid,date)',
    'platform_stats()', 'platform_list_plans()', 'platform_save_plan(uuid,text,text,numeric,boolean)',
    'platform_get_settings()', 'platform_set_setting(text,jsonb)', 'platform_list_admins()', 'platform_add_admin(text)', 'platform_remove_admin(uuid)',
    'platform_list_notices()', 'platform_save_notice(text,text,text,text,uuid,timestamptz)', 'platform_end_notice(uuid)',
    'td_my_notices(uuid)', 'td_dismiss_notice(text)', 'platform_list_shops()']
  loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;
