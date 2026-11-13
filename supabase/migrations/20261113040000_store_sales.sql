-- TheDashboard Store: own movement table + POS sales recording
--
-- 1. REPAIR. Earlier versions of the Store migrations assumed there was no
--    public.stock_movements table. Databases that already had one (the
--    mobile app's table: movement_type / qty_change / note) got a `kind`
--    column, a check on it and an extra read policy added. This puts that
--    table back exactly as it was. (Indexes on product_id / shop_id are left:
--    they only speed up reads.)
-- 2. Store keeps its own ledger in public.store_movements.
-- 3. POS sales, credit batches and field orders are recorded as SALE
--    movements through kibali_sell().
--
-- Safe to run on any database state, and safe to run more than once.

begin;

-- 1. Restore the pre-existing stock_movements table --------------------
do $$
begin
  if to_regclass('public.stock_movements') is not null then
    execute 'drop policy if exists stock_movements_read on public.stock_movements';
    -- `kind` + its check were only ever added together by Store
    if exists (select 1 from pg_constraint where conname = 'stock_movements_kind_check'
               and conrelid = 'public.stock_movements'::regclass) then
      execute 'alter table public.stock_movements drop constraint stock_movements_kind_check';
      execute 'alter table public.stock_movements drop column if exists kind';
    end if;
  end if;
end $$;

-- 2. Store's own movement ledger ----------------------------------------
create table if not exists public.store_movements (
  id               bigint      generated always as identity primary key,
  shop_id          uuid        not null,
  product_name     text        not null,
  unit             text,
  kind             text        not null default 'retail',
  type             text        not null,
  qty              integer     not null check (qty <> 0),   -- signed: + in, − out
  balance_after    integer     not null,
  reference        text,
  note             text,
  order_id         uuid        references public.release_orders(id) on delete set null,
  created_by       uuid        not null,
  created_by_name  text        not null,
  created_at       timestamptz not null default now()
);

alter table public.store_movements add column if not exists kind text not null default 'retail';

do $$
declare t text;
begin
  -- product_id typed like products.id
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'store_movements' and column_name = 'product_id') then
    select format_type(atttypid, atttypmod) into t
      from pg_attribute where attrelid = 'public.products'::regclass and attname = 'id';
    execute format('alter table public.store_movements add column product_id %s not null references public.products(id)', t);
  end if;
  -- checks (re)created with the full set of values
  if exists (select 1 from pg_constraint where conname = 'store_movements_type_check') then
    alter table public.store_movements drop constraint store_movements_type_check;
  end if;
  alter table public.store_movements add constraint store_movements_type_check check (type in ('IN','OUT','ADJ','SALE'));
  if not exists (select 1 from pg_constraint where conname = 'store_movements_kind_check') then
    alter table public.store_movements add constraint store_movements_kind_check check (kind in ('retail','wholesale'));
  end if;
end $$;

create index if not exists store_movements_product_idx on public.store_movements (product_id, created_at desc);
create index if not exists store_movements_shop_idx    on public.store_movements (shop_id, created_at desc);

alter table public.store_movements enable row level security;
drop policy if exists store_movements_read on public.store_movements;
create policy store_movements_read on public.store_movements
  for select using (shop_id = public.kibali_my_shop() and public.kibali_can('stock.receive'));
grant select on public.store_movements to authenticated;

-- 3. Permissions (adds stock.sell) ---------------------------------------
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
    when 'stock.sell'    then v_role in ('super_admin','shop_admin','cashier')
    when 'kibali.audit'  then v_role in ('super_admin','shop_admin')
    when 'kibali.use'    then v_role in ('super_admin','shop_admin','shop_clerk','cashier','storekeeper')
    else false
  end;
end $$;

-- 4. Stock move writes to store_movements --------------------------------
create or replace function public.kibali__move(
  p_shop uuid, p_product_id text, p_kind text, p_type text, p_delta int,
  p_reference text, p_note text, p_order uuid, p_order_no text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_unit text; v_cur int; v_new int;
  v_label text := case when p_kind = 'wholesale' then 'wholesale' else 'retail' end;
begin
  select name, coalesce(unit, 'unit'),
         case when p_kind = 'wholesale' then coalesce(wholesale_stock, 0)
              when coalesce(retail_stock, 0) <> 0 then retail_stock
              else coalesce(stock, 0) end
    into v_name, v_unit, v_cur
  from public.products
  where id::text = p_product_id and shop_id = p_shop
  for update;
  if not found then raise exception 'Product not found in this shop'; end if;

  v_new := v_cur + p_delta;
  if v_new < 0 then
    perform public.kibali__alert(p_shop, 'negative', p_order, p_order_no,
      format('%s (%s): system stock was %s but %s were taken out — stock count needed', v_name, v_label, v_cur, -p_delta));
    v_new := 0;
  end if;

  if p_kind = 'wholesale' then
    update public.products set wholesale_stock = v_new where id::text = p_product_id;
  else
    update public.products set retail_stock = v_new, stock = v_new where id::text = p_product_id;
  end if;

  insert into public.store_movements
    (shop_id, product_id, product_name, unit, kind, type, qty, balance_after, reference, note, order_id, created_by, created_by_name)
  select p_shop, p.id, v_name, v_unit, p_kind, p_type, p_delta, v_new, p_reference, p_note, p_order, auth.uid(), public.kibali_my_name()
  from public.products p where p.id::text = p_product_id;

  return v_new;
end $$;
revoke all on function public.kibali__move(uuid,text,text,text,int,text,text,uuid,text) from public, anon, authenticated;

-- 5. Record a sale: p_items = [{"product_id": "...", "qty": 3, "kind": "retail"|"wholesale"}]
create or replace function public.kibali_sell(p_items jsonb, p_reference text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_shop uuid := public.kibali_my_shop();
  it jsonb; v_qty int; v_type text; v_kind text; v_bal int;
  v_out jsonb := '[]';
begin
  if not public.kibali_can('stock.sell') then raise exception 'Not allowed to record sales'; end if;
  if p_items is null or jsonb_array_length(p_items) = 0 then return v_out; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := round((it->>'qty')::numeric)::int;
    continue when v_qty is null or v_qty <= 0;
    select product_type into v_type from public.products
     where id::text = it->>'product_id' and shop_id = v_shop;
    if not found then raise exception 'Product not found in this shop'; end if;
    v_kind := public.kibali__kind(it->>'kind', v_type);
    v_bal := public.kibali__move(v_shop, it->>'product_id', v_kind, 'SALE', -v_qty,
                                 coalesce(nullif(trim(p_reference),''), 'Sale'), null, null, null);
    v_out := v_out || jsonb_build_object('product_id', it->>'product_id', 'kind', v_kind, 'balance', v_bal);
  end loop;
  return v_out;
end $$;

revoke all on function public.kibali_sell(jsonb, text) from public, anon;
grant execute on function public.kibali_sell(jsonb, text) to authenticated;

commit;
