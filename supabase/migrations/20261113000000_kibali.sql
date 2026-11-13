-- =====================================================================
-- Kibali — shop-to-store release orders + stock movement ledger
-- for TheDashboard (Serengeti Labs)
--
-- What this adds
--   * shop_modules       which modules a shop has paid for (pos, kibali)
--   * two new roles      shop_clerk (creates orders), storekeeper (releases)
--   * release orders     orders, items, releases, private release codes
--   * stock_movements    append-only ledger of every IN / OUT / ADJ
--   * kibali_alerts      tamper, wrong code, unknown order, adjustments…
--   * RPC functions      the ONLY way to write Kibali data. Each checks
--                        the caller's role + module, then does the work
--                        in one transaction (row locks, no double release)
--
-- Safe to run on the live database: it only ADDS objects. Existing shops
-- get the 'pos' module switched on, so nothing changes for them until
-- 'kibali' is enabled for a shop.
--
-- Run in the Supabase SQL editor (or `supabase db push`).
-- =====================================================================

begin;

-- ---------------------------------------------------------------------
-- 1. Modules: what each shop has paid for
-- ---------------------------------------------------------------------
create table if not exists public.shop_modules (
  shop_id     uuid        not null references public.shops(id) on delete cascade,
  module      text        not null check (module in ('pos', 'kibali')),
  active      boolean     not null default true,
  expires_at  timestamptz,
  updated_at  timestamptz not null default now(),
  primary key (shop_id, module)
);

-- Every existing shop keeps POS. Kibali is switched on per shop by Serengeti
-- Labs (billing admin / SQL) — never by the shop itself.
insert into public.shop_modules (shop_id, module, active)
select id, 'pos', true from public.shops
on conflict do nothing;

alter table public.shop_modules enable row level security;

-- ---------------------------------------------------------------------
-- 2. Roles: allow the two new role values on app_users.role
--    (NOT VALID = existing rows are not re-checked)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_constraint
             where conrelid = 'public.app_users'::regclass
               and conname = 'app_users_role_check') then
    alter table public.app_users drop constraint app_users_role_check;
    alter table public.app_users add constraint app_users_role_check
      check (role in ('super_admin','shop_admin','cashier','sales_rep','shop_clerk','storekeeper')) not valid;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 3. Helper functions (security definer, read-only)
-- ---------------------------------------------------------------------
create or replace function public.kibali_my_shop()
returns uuid language sql stable security definer set search_path = public as $$
  select shop_id from public.app_users where id = auth.uid()
$$;

create or replace function public.kibali_my_role()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(role, 'shop_admin') from public.app_users where id = auth.uid()
$$;

create or replace function public.kibali_my_name()
returns text language sql stable security definer set search_path = public as $$
  select coalesce(full_name, email, 'Staff') from public.app_users where id = auth.uid()
$$;

create or replace function public.kibali_has_module(p_shop uuid, p_module text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.shop_modules
    where shop_id = p_shop and module = p_module and active
      and (expires_at is null or expires_at > now())
  )
$$;

-- Role → permission map. A permission is granted only when the shop's
-- Kibali module is active AND the caller's role carries it.
create or replace function public.kibali_can(p_perm text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare
  v_role text := public.kibali_my_role();
  v_shop uuid := public.kibali_my_shop();
begin
  if v_shop is null or not public.kibali_has_module(v_shop, 'kibali') then
    return false;
  end if;
  return case p_perm
    when 'order.create'  then v_role in ('super_admin','shop_admin','shop_clerk','cashier')
    when 'order.cancel'  then v_role in ('super_admin','shop_admin','shop_clerk','cashier')
    when 'order.release' then v_role in ('super_admin','shop_admin','storekeeper')
    when 'stock.view'    then v_role in ('super_admin','shop_admin','storekeeper','shop_clerk','cashier')
    when 'stock.receive' then v_role in ('super_admin','shop_admin','storekeeper')
    when 'stock.adjust'  then v_role in ('super_admin','shop_admin')
    when 'kibali.audit'  then v_role in ('super_admin','shop_admin')
    when 'kibali.use'    then v_role in ('super_admin','shop_admin','shop_clerk','cashier','storekeeper')
    else false
  end;
end $$;

-- ---------------------------------------------------------------------
-- 4. Tables
-- ---------------------------------------------------------------------
create table if not exists public.release_orders (
  id               uuid        primary key default gen_random_uuid(),
  shop_id          uuid        not null references public.shops(id) on delete cascade,
  order_no         text        not null,
  status           text        not null default 'PENDING'
                               check (status in ('PENDING','PARTIAL','RELEASED','CANCELLED')),
  customer_name    text,
  customer_phone   text,
  collector_name   text,
  sale_ref         text,
  flagged          boolean     not null default false,
  cancel_reason    text,
  cancelled_by     uuid,
  cancelled_by_name text,
  created_by       uuid        not null,
  created_by_name  text        not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (shop_id, order_no)
);
create index if not exists release_orders_shop_status_idx on public.release_orders (shop_id, status, created_at desc);

-- Release codes live apart so storekeepers can never read them.
create table if not exists public.release_order_secrets (
  order_id   uuid primary key references public.release_orders(id) on delete cascade,
  shop_id    uuid not null,
  code       text not null check (code ~ '^[0-9]{4}$')
);

create table if not exists public.release_order_items (
  id            uuid    primary key default gen_random_uuid(),
  order_id      uuid    not null references public.release_orders(id) on delete cascade,
  shop_id       uuid    not null,
  product_name  text    not null,
  unit          text    not null default 'unit',
  qty           integer not null check (qty > 0),
  released      integer not null default 0 check (released >= 0),
  line_no       integer not null,
  check (released <= qty)
);
create index if not exists release_order_items_order_idx on public.release_order_items (order_id);

create table if not exists public.release_order_releases (
  id               uuid        primary key default gen_random_uuid(),
  order_id         uuid        not null references public.release_orders(id) on delete cascade,
  shop_id          uuid        not null,
  released_by      uuid        not null,
  released_by_name text        not null,
  collector_name   text        not null,
  collector_phone  text,
  lines            jsonb       not null,   -- [{item_id, product_name, unit, qty}]
  created_at       timestamptz not null default now()
);
create index if not exists release_order_releases_order_idx on public.release_order_releases (order_id);

create table if not exists public.stock_movements (
  id               bigint      generated always as identity primary key,
  shop_id          uuid        not null,
  product_name     text        not null,
  unit             text,
  type             text        not null check (type in ('IN','OUT','ADJ')),
  qty              integer     not null check (qty <> 0),   -- signed: + in, − out
  balance_after    integer     not null,
  reference        text,
  note             text,
  order_id         uuid        references public.release_orders(id) on delete set null,
  created_by       uuid        not null,
  created_by_name  text        not null,
  created_at       timestamptz not null default now()
);

create table if not exists public.kibali_alerts (
  id               uuid        primary key default gen_random_uuid(),
  shop_id          uuid        not null,
  type             text        not null check (type in ('tamper','badcode','unknown','reuse','cancel','adjust','negative','locked')),
  order_id         uuid        references public.release_orders(id) on delete set null,
  order_no         text,
  message          text        not null,
  created_by       uuid,
  created_by_name  text,
  created_at       timestamptz not null default now(),
  resolved_at      timestamptz,
  resolved_by_name text
);
create index if not exists kibali_alerts_shop_idx on public.kibali_alerts (shop_id, created_at desc);

-- product_id columns typed to match products.id (uuid or bigint)
do $$
declare t text;
begin
  select format_type(atttypid, atttypmod) into t
  from pg_attribute where attrelid = 'public.products'::regclass and attname = 'id';
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='release_order_items' and column_name='product_id') then
    execute format('alter table public.release_order_items add column product_id %s not null references public.products(id)', t);
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema='public' and table_name='stock_movements' and column_name='product_id') then
    execute format('alter table public.stock_movements add column product_id %s not null references public.products(id)', t);
  end if;
end $$;
create index if not exists stock_movements_product_idx on public.stock_movements (product_id, created_at desc);
create index if not exists stock_movements_shop_idx on public.stock_movements (shop_id, created_at desc);

-- ---------------------------------------------------------------------
-- 5. Row level security: reads only. There are NO insert/update/delete
--    policies — every write goes through the functions below.
-- ---------------------------------------------------------------------
alter table public.release_orders          enable row level security;
alter table public.release_order_secrets   enable row level security;
alter table public.release_order_items     enable row level security;
alter table public.release_order_releases  enable row level security;
alter table public.stock_movements         enable row level security;
alter table public.kibali_alerts           enable row level security;

drop policy if exists shop_modules_read on public.shop_modules;
create policy shop_modules_read on public.shop_modules
  for select using (shop_id = public.kibali_my_shop());

drop policy if exists release_orders_read on public.release_orders;
create policy release_orders_read on public.release_orders
  for select using (shop_id = public.kibali_my_shop() and public.kibali_can('kibali.use'));

drop policy if exists release_order_items_read on public.release_order_items;
create policy release_order_items_read on public.release_order_items
  for select using (shop_id = public.kibali_my_shop() and public.kibali_can('kibali.use'));

drop policy if exists release_order_releases_read on public.release_order_releases;
create policy release_order_releases_read on public.release_order_releases
  for select using (shop_id = public.kibali_my_shop() and public.kibali_can('kibali.use'));

-- Only people who issue orders (and the owner) can read release codes.
drop policy if exists release_order_secrets_read on public.release_order_secrets;
create policy release_order_secrets_read on public.release_order_secrets
  for select using (shop_id = public.kibali_my_shop() and public.kibali_can('order.create'));

drop policy if exists stock_movements_read on public.stock_movements;
create policy stock_movements_read on public.stock_movements
  for select using (shop_id = public.kibali_my_shop() and public.kibali_can('stock.receive'));

drop policy if exists kibali_alerts_read on public.kibali_alerts;
create policy kibali_alerts_read on public.kibali_alerts
  for select using (shop_id = public.kibali_my_shop() and public.kibali_can('kibali.audit'));

-- Reserved stock = quantity on orders not yet collected
create or replace view public.kibali_reserved with (security_invoker = true) as
  select i.shop_id, i.product_id, sum(i.qty - i.released)::int as reserved
  from public.release_order_items i
  join public.release_orders o on o.id = i.order_id
  where o.status in ('PENDING','PARTIAL')
  group by i.shop_id, i.product_id;

-- ---------------------------------------------------------------------
-- 6. Internal helpers (not callable by clients)
-- ---------------------------------------------------------------------
create or replace function public.kibali__alert(p_shop uuid, p_type text, p_order uuid, p_order_no text, p_msg text)
returns void language sql security definer set search_path = public as $$
  insert into public.kibali_alerts (shop_id, type, order_id, order_no, message, created_by, created_by_name)
  values (p_shop, p_type, p_order, p_order_no, p_msg, auth.uid(), public.kibali_my_name());
$$;

-- Change a product's stock under a row lock and log the movement.
-- Returns the new balance. Stock never goes below 0 in products (matches
-- the rest of TheDashboard); a shortfall raises a 'negative' alert.
create or replace function public.kibali__move(
  p_shop uuid, p_product_id text, p_type text, p_delta int,
  p_reference text, p_note text, p_order uuid, p_order_no text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_unit text; v_stock int; v_new int;
begin
  select name, coalesce(unit,'unit'), coalesce(stock,0)
    into v_name, v_unit, v_stock
  from public.products
  where id::text = p_product_id and shop_id = p_shop
  for update;
  if not found then raise exception 'Product not found in this shop'; end if;

  v_new := v_stock + p_delta;
  if v_new < 0 then
    perform public.kibali__alert(p_shop, 'negative', p_order, p_order_no,
      format('%s: system stock was %s but %s were taken out — stock count needed', v_name, v_stock, -p_delta));
    v_new := 0;
  end if;

  update public.products set stock = v_new, retail_stock = v_new where id::text = p_product_id;

  insert into public.stock_movements
    (shop_id, product_id, product_name, unit, type, qty, balance_after, reference, note, order_id, created_by, created_by_name)
  select p_shop, p.id, v_name, v_unit, p_type, p_delta, v_new, p_reference, p_note, p_order, auth.uid(), public.kibali_my_name()
  from public.products p where p.id::text = p_product_id;

  return v_new;
end $$;

revoke all on function public.kibali__alert(uuid,text,uuid,text,text) from public, anon, authenticated;
revoke all on function public.kibali__move(uuid,text,text,int,text,text,uuid,text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Client-callable functions
-- ---------------------------------------------------------------------

-- 7a. Shop: create an order. p_items = [{"product_id": "...", "qty": 10}, ...]
create or replace function public.kibali_create_order(
  p_customer text, p_phone text, p_collector text, p_sale_ref text, p_items jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := public.kibali_my_shop();
  v_order uuid; v_no text; v_code text; v_line int := 0;
  it jsonb; v_qty int; v_prod record;
  alph text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not public.kibali_can('order.create') then raise exception 'Not allowed to create release orders'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one item'; end if;

  -- unique order number: DDMM-XXXX
  loop
    v_no := to_char(now() at time zone 'Africa/Dar_es_Salaam', 'DDMM') || '-' ||
            (select string_agg(substr(alph, 1 + floor(random()*length(alph))::int, 1), '') from generate_series(1,4));
    exit when not exists (select 1 from public.release_orders where shop_id = v_shop and order_no = v_no);
  end loop;
  v_code := lpad((1000 + floor(random()*9000))::int::text, 4, '0');

  insert into public.release_orders (shop_id, order_no, customer_name, customer_phone, collector_name, sale_ref, created_by, created_by_name)
  values (v_shop, v_no, nullif(trim(p_customer),''), nullif(trim(p_phone),''), nullif(trim(p_collector),''), nullif(trim(p_sale_ref),''),
          auth.uid(), public.kibali_my_name())
  returning id into v_order;

  insert into public.release_order_secrets (order_id, shop_id, code) values (v_order, v_shop, v_code);

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::int;
    if v_qty is null or v_qty < 1 then raise exception 'Quantities must be whole numbers of 1 or more'; end if;
    select id, name, coalesce(unit,'unit') as unit into v_prod
      from public.products where id::text = it->>'product_id' and shop_id = v_shop and coalesce(is_active,true);
    if not found then raise exception 'Item not found in this shop'; end if;
    v_line := v_line + 1;
    insert into public.release_order_items (order_id, shop_id, product_id, product_name, unit, qty, line_no)
    values (v_order, v_shop, v_prod.id, v_prod.name, v_prod.unit, v_qty, v_line);
  end loop;

  return jsonb_build_object('order_id', v_order, 'order_no', v_no, 'code', v_code);
end $$;

-- 7b. Store: open an order with its number + release code.
--     Logs unknown numbers and wrong codes; locks after 5 wrong codes/hour.
create or replace function public.kibali_lookup_order(p_order_no text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := public.kibali_my_shop();
  v_no text := upper(trim(p_order_no));
  o public.release_orders; v_code text; v_fails int;
begin
  if not public.kibali_can('order.release') then raise exception 'Not allowed to release goods'; end if;

  select * into o from public.release_orders where shop_id = v_shop and order_no = v_no;
  if not found then
    perform public.kibali__alert(v_shop, 'unknown', null, v_no, format('Store looked up order number that does not exist: %s', v_no));
    return jsonb_build_object('error', 'not_found');
  end if;

  select count(*) into v_fails from public.kibali_alerts
   where order_id = o.id and type = 'badcode' and created_at > now() - interval '1 hour';
  if v_fails >= 5 then
    return jsonb_build_object('error', 'locked');
  end if;

  select code into v_code from public.release_order_secrets where order_id = o.id;
  if v_code is distinct from trim(p_code) then
    perform public.kibali__alert(v_shop, 'badcode', o.id, o.order_no,
      format('Wrong release code entered for %s (attempt %s in the last hour)', o.order_no, v_fails + 1));
    if v_fails + 1 >= 5 then
      perform public.kibali__alert(v_shop, 'locked', o.id, o.order_no,
        format('Order %s locked for 1 hour after 5 wrong release codes', o.order_no));
      return jsonb_build_object('error', 'locked');
    end if;
    return jsonb_build_object('error', 'bad_code');
  end if;

  if o.status = 'RELEASED' then
    perform public.kibali__alert(v_shop, 'reuse', o.id, o.order_no, format('Fully released order %s was opened again at the store', o.order_no));
  end if;

  return jsonb_build_object(
    'order', to_jsonb(o),
    'items', (select coalesce(jsonb_agg(to_jsonb(i) order by i.line_no), '[]') from public.release_order_items i where i.order_id = o.id),
    'releases', (select coalesce(jsonb_agg(to_jsonb(r) order by r.created_at), '[]') from public.release_order_releases r where r.order_id = o.id));
end $$;

-- 7c. Store: release goods. p_lines = [{"item_id": "...", "qty": 10}, ...]
--     Locks the order, re-checks the code and remaining quantities,
--     deducts stock and logs everything in ONE transaction.
create or replace function public.kibali_release(
  p_order_no text, p_code text, p_lines jsonb, p_collector text, p_collector_phone text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := public.kibali_my_shop();
  o public.release_orders; v_code text;
  ln jsonb; v_item public.release_order_items; v_qty int;
  v_done jsonb := '[]'; v_all_done boolean; v_status text;
begin
  if not public.kibali_can('order.release') then raise exception 'Not allowed to release goods'; end if;
  if coalesce(trim(p_collector),'') = '' then raise exception 'Write the name of the person collecting'; end if;

  select * into o from public.release_orders
   where shop_id = v_shop and order_no = upper(trim(p_order_no)) for update;
  if not found then raise exception 'Order not found'; end if;

  select code into v_code from public.release_order_secrets where order_id = o.id;
  if v_code is distinct from trim(p_code) then raise exception 'Wrong release code'; end if;
  if o.status in ('CANCELLED','RELEASED') then raise exception 'This order is % — nothing can be released', lower(o.status); end if;
  if o.flagged then raise exception 'This order is flagged for a paper mismatch. The owner must clear it first.'; end if;

  for ln in select * from jsonb_array_elements(coalesce(p_lines,'[]')) loop
    v_qty := (ln->>'qty')::int;
    continue when v_qty is null or v_qty = 0;
    if v_qty < 0 then raise exception 'Quantities must be whole numbers'; end if;
    select * into v_item from public.release_order_items
     where id::text = ln->>'item_id' and order_id = o.id for update;
    if not found then raise exception 'Item is not on this order'; end if;
    if v_qty > v_item.qty - v_item.released then
      raise exception '%: only % left on this order — cannot give %', v_item.product_name, v_item.qty - v_item.released, v_qty;
    end if;
    update public.release_order_items set released = released + v_qty where id = v_item.id;
    perform public.kibali__move(v_shop, v_item.product_id::text, 'OUT', -v_qty, o.order_no,
                                'Collected by ' || trim(p_collector), o.id, o.order_no);
    v_done := v_done || jsonb_build_object('item_id', v_item.id, 'product_name', v_item.product_name, 'unit', v_item.unit, 'qty', v_qty);
  end loop;

  if jsonb_array_length(v_done) = 0 then raise exception 'Nothing to release — all quantities are 0'; end if;

  insert into public.release_order_releases (order_id, shop_id, released_by, released_by_name, collector_name, collector_phone, lines)
  values (o.id, v_shop, auth.uid(), public.kibali_my_name(), trim(p_collector), nullif(trim(p_collector_phone),''), v_done);

  select bool_and(released >= qty) into v_all_done from public.release_order_items where order_id = o.id;
  v_status := case when v_all_done then 'RELEASED' else 'PARTIAL' end;
  update public.release_orders set status = v_status, updated_at = now() where id = o.id;

  return jsonb_build_object('status', v_status, 'released', v_done);
end $$;

-- 7d. Store: paper doesn't match the system
create or replace function public.kibali_report_mismatch(p_order_id uuid, p_paper_says text, p_brought_by text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.release_orders;
begin
  if not public.kibali_can('order.release') then raise exception 'Not allowed'; end if;
  if coalesce(trim(p_paper_says),'') = '' then raise exception 'Write what the paper says'; end if;
  select * into o from public.release_orders where id = p_order_id and shop_id = public.kibali_my_shop() for update;
  if not found then raise exception 'Order not found'; end if;
  update public.release_orders set flagged = true, updated_at = now() where id = o.id;
  perform public.kibali__alert(o.shop_id, 'tamper', o.id, o.order_no,
    format('Paper mismatch on %s: %s%s', o.order_no, trim(p_paper_says),
           case when coalesce(trim(p_brought_by),'') <> '' then ' — brought by ' || trim(p_brought_by) else '' end));
end $$;

-- 7e. Owner: clear a flag after checking with the shop
create or replace function public.kibali_clear_flag(p_order_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.kibali_can('kibali.audit') then raise exception 'Only the owner can clear a flag'; end if;
  update public.release_orders set flagged = false, updated_at = now()
   where id = p_order_id and shop_id = public.kibali_my_shop();
  update public.kibali_alerts set resolved_at = now(), resolved_by_name = public.kibali_my_name()
   where order_id = p_order_id and type = 'tamper' and resolved_at is null;
end $$;

-- 7f. Shop: cancel an order (only while nothing has been released)
create or replace function public.kibali_cancel_order(p_order_id uuid, p_reason text)
returns void language plpgsql security definer set search_path = public as $$
declare o public.release_orders;
begin
  if not public.kibali_can('order.cancel') then raise exception 'Not allowed to cancel orders'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  select * into o from public.release_orders where id = p_order_id and shop_id = public.kibali_my_shop() for update;
  if not found then raise exception 'Order not found'; end if;
  if o.status <> 'PENDING' then raise exception 'The store has already released goods on this order — it cannot be cancelled'; end if;
  update public.release_orders
     set status = 'CANCELLED', cancel_reason = trim(p_reason), cancelled_by = auth.uid(),
         cancelled_by_name = public.kibali_my_name(), updated_at = now()
   where id = o.id;
  perform public.kibali__alert(o.shop_id, 'cancel', o.id, o.order_no, format('Order %s cancelled: %s', o.order_no, trim(p_reason)));
end $$;

-- 7g. Store/owner: receive stock
create or replace function public.kibali_receive_stock(p_product_id text, p_qty int, p_reference text)
returns int language plpgsql security definer set search_path = public as $$
begin
  if not public.kibali_can('stock.receive') then raise exception 'Not allowed to receive stock'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be a whole number of 1 or more'; end if;
  return public.kibali__move(public.kibali_my_shop(), p_product_id, 'IN', p_qty,
                             coalesce(nullif(trim(p_reference),''), 'Stock in'), null, null, null);
end $$;

-- 7h. Owner: adjust stock. p_mode: 'count' (set balance), 'add', 'remove'
create or replace function public.kibali_adjust_stock(p_product_id text, p_mode text, p_qty int, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_shop uuid := public.kibali_my_shop(); v_cur int; v_name text; v_unit text; v_delta int; v_new int;
begin
  if not public.kibali_can('stock.adjust') then raise exception 'Only the owner can adjust stock'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Enter a whole number'; end if;
  select coalesce(stock,0), name, coalesce(unit,'unit') into v_cur, v_name, v_unit
    from public.products where id::text = p_product_id and shop_id = v_shop;
  if not found then raise exception 'Product not found'; end if;
  v_delta := case p_mode when 'count' then p_qty - v_cur when 'add' then p_qty when 'remove' then -p_qty
             else null end;
  if v_delta is null then raise exception 'Unknown adjustment type'; end if;
  if v_delta = 0 then raise exception 'Count matches the system — nothing to adjust'; end if;
  v_new := public.kibali__move(v_shop, p_product_id, 'ADJ', v_delta, trim(p_reason), p_mode, null, null);
  perform public.kibali__alert(v_shop, 'adjust', null, null,
    format('%s: %s%s %s (balance now %s) — %s', v_name, case when v_delta > 0 then '+' else '' end, v_delta, v_unit, v_new, trim(p_reason)));
  return v_new;
end $$;

-- 7i. Owner: mark an alert as handled
create or replace function public.kibali_resolve_alert(p_alert_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.kibali_can('kibali.audit') then raise exception 'Not allowed'; end if;
  update public.kibali_alerts set resolved_at = now(), resolved_by_name = public.kibali_my_name()
   where id = p_alert_id and shop_id = public.kibali_my_shop();
end $$;

-- Who can call what
revoke all on function public.kibali_create_order(text,text,text,text,jsonb)   from public, anon;
revoke all on function public.kibali_lookup_order(text,text)                   from public, anon;
revoke all on function public.kibali_release(text,text,jsonb,text,text)        from public, anon;
revoke all on function public.kibali_report_mismatch(uuid,text,text)           from public, anon;
revoke all on function public.kibali_clear_flag(uuid)                          from public, anon;
revoke all on function public.kibali_cancel_order(uuid,text)                   from public, anon;
revoke all on function public.kibali_receive_stock(text,int,text)              from public, anon;
revoke all on function public.kibali_adjust_stock(text,text,int,text)          from public, anon;
revoke all on function public.kibali_resolve_alert(uuid)                       from public, anon;
grant execute on function public.kibali_create_order(text,text,text,text,jsonb)  to authenticated;
grant execute on function public.kibali_lookup_order(text,text)                  to authenticated;
grant execute on function public.kibali_release(text,text,jsonb,text,text)       to authenticated;
grant execute on function public.kibali_report_mismatch(uuid,text,text)          to authenticated;
grant execute on function public.kibali_clear_flag(uuid)                         to authenticated;
grant execute on function public.kibali_cancel_order(uuid,text)                  to authenticated;
grant execute on function public.kibali_receive_stock(text,int,text)             to authenticated;
grant execute on function public.kibali_adjust_stock(text,text,int,text)         to authenticated;
grant execute on function public.kibali_resolve_alert(uuid)                      to authenticated;

grant select on public.shop_modules, public.release_orders, public.release_order_secrets,
                public.release_order_items, public.release_order_releases,
                public.stock_movements, public.kibali_alerts, public.kibali_reserved to authenticated;

commit;

-- ---------------------------------------------------------------------
-- To switch Kibali on for a shop (run as admin, e.g. from billing admin):
--   insert into public.shop_modules (shop_id, module, active)
--   values ('<shop uuid>', 'kibali', true)
--   on conflict (shop_id, module) do update set active = true, updated_at = now();
-- Kibali-only shop: also  update public.shop_modules set active = false
--   where shop_id = '<shop uuid>' and module = 'pos';
-- ---------------------------------------------------------------------
