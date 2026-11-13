-- Kibali: track retail and wholesale stock separately
--   kind = 'retail'    -> products.retail_stock (falls back to stock); stock kept equal
--   kind = 'wholesale' -> products.wholesale_stock
-- Every order line, release, delivery and adjustment carries its kind, so
-- only that quantity moves. Default kind follows the product type
-- (wholesale items -> wholesale, everything else -> retail).
-- Safe to run more than once.

begin;

-- 1. kind columns ------------------------------------------------------
alter table public.release_order_items add column if not exists kind text not null default 'retail';
alter table public.stock_movements     add column if not exists kind text not null default 'retail';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'release_order_items_kind_check') then
    alter table public.release_order_items add constraint release_order_items_kind_check check (kind in ('retail','wholesale'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stock_movements_kind_check') then
    alter table public.stock_movements add constraint stock_movements_kind_check check (kind in ('retail','wholesale'));
  end if;
end $$;

-- Rows written before this change: wholesale items moved wholesale stock
update public.release_order_items i set kind = 'wholesale'
  from public.products p where p.id = i.product_id and p.product_type = 'wholesale' and i.kind <> 'wholesale';
update public.stock_movements m set kind = 'wholesale'
  from public.products p where p.id = m.product_id and p.product_type = 'wholesale' and m.kind <> 'wholesale';

-- 2. helpers -----------------------------------------------------------
create or replace function public.kibali_default_kind(p_type text)
returns text language sql immutable as $$
  select case when p_type = 'wholesale' then 'wholesale' else 'retail' end
$$;

create or replace function public.kibali__kind(p_kind text, p_type text)
returns text language plpgsql immutable as $$
begin
  if p_kind is null or p_kind = '' then return public.kibali_default_kind(p_type); end if;
  if p_kind not in ('retail','wholesale') then raise exception 'Stock type must be retail or wholesale'; end if;
  return p_kind;
end $$;

-- 3. stock move with kind ----------------------------------------------
drop function if exists public.kibali__move(uuid,text,text,int,text,text,uuid,text);

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

  insert into public.stock_movements
    (shop_id, product_id, product_name, unit, kind, type, qty, balance_after, reference, note, order_id, created_by, created_by_name)
  select p_shop, p.id, v_name, v_unit, p_kind, p_type, p_delta, v_new, p_reference, p_note, p_order, auth.uid(), public.kibali_my_name()
  from public.products p where p.id::text = p_product_id;

  return v_new;
end $$;
revoke all on function public.kibali__move(uuid,text,text,text,int,text,text,uuid,text) from public, anon, authenticated;

-- 4. create order: items may carry "kind" --------------------------------
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
    select id, name, coalesce(unit,'unit') as unit, product_type into v_prod
      from public.products where id::text = it->>'product_id' and shop_id = v_shop and coalesce(is_active,true);
    if not found then raise exception 'Item not found in this shop'; end if;
    v_line := v_line + 1;
    insert into public.release_order_items (order_id, shop_id, product_id, product_name, unit, qty, line_no, kind)
    values (v_order, v_shop, v_prod.id, v_prod.name, v_prod.unit, v_qty, v_line, public.kibali__kind(it->>'kind', v_prod.product_type));
  end loop;

  return jsonb_build_object('order_id', v_order, 'order_no', v_no, 'code', v_code);
end $$;

-- 5. release: move the line's own kind -----------------------------------
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
    perform public.kibali__move(v_shop, v_item.product_id::text, v_item.kind, 'OUT', -v_qty, o.order_no,
                                'Collected by ' || trim(p_collector), o.id, o.order_no);
    v_done := v_done || jsonb_build_object('item_id', v_item.id, 'product_name', v_item.product_name,
                                           'unit', v_item.unit, 'kind', v_item.kind, 'qty', v_qty);
  end loop;

  if jsonb_array_length(v_done) = 0 then raise exception 'Nothing to release — all quantities are 0'; end if;

  insert into public.release_order_releases (order_id, shop_id, released_by, released_by_name, collector_name, collector_phone, lines)
  values (o.id, v_shop, auth.uid(), public.kibali_my_name(), trim(p_collector), nullif(trim(p_collector_phone),''), v_done);

  select bool_and(released >= qty) into v_all_done from public.release_order_items where order_id = o.id;
  v_status := case when v_all_done then 'RELEASED' else 'PARTIAL' end;
  update public.release_orders set status = v_status, updated_at = now() where id = o.id;

  return jsonb_build_object('status', v_status, 'released', v_done);
end $$;

-- 6. receive + adjust take a kind ---------------------------------------
drop function if exists public.kibali_receive_stock(text,int,text);
create or replace function public.kibali_receive_stock(p_product_id text, p_qty int, p_reference text, p_kind text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_shop uuid := public.kibali_my_shop(); v_type text;
begin
  if not public.kibali_can('stock.receive') then raise exception 'Not allowed to receive stock'; end if;
  if p_qty is null or p_qty < 1 then raise exception 'Quantity must be a whole number of 1 or more'; end if;
  select product_type into v_type from public.products where id::text = p_product_id and shop_id = v_shop;
  if not found then raise exception 'Product not found'; end if;
  return public.kibali__move(v_shop, p_product_id, public.kibali__kind(p_kind, v_type), 'IN', p_qty,
                             coalesce(nullif(trim(p_reference),''), 'Stock in'), null, null, null);
end $$;

drop function if exists public.kibali_adjust_stock(text,text,int,text);
create or replace function public.kibali_adjust_stock(p_product_id text, p_mode text, p_qty int, p_reason text, p_kind text default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_shop uuid := public.kibali_my_shop(); v_cur int; v_name text; v_unit text; v_type text; v_kind text; v_delta int; v_new int;
begin
  if not public.kibali_can('stock.adjust') then raise exception 'Only the owner can adjust stock'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Enter a whole number'; end if;
  select name, coalesce(unit,'unit'), product_type into v_name, v_unit, v_type
    from public.products where id::text = p_product_id and shop_id = v_shop;
  if not found then raise exception 'Product not found'; end if;
  v_kind := public.kibali__kind(p_kind, v_type);
  select case when v_kind = 'wholesale' then coalesce(wholesale_stock,0)
              when coalesce(retail_stock,0) <> 0 then retail_stock else coalesce(stock,0) end
    into v_cur from public.products where id::text = p_product_id;
  v_delta := case p_mode when 'count' then p_qty - v_cur when 'add' then p_qty when 'remove' then -p_qty
             else null end;
  if v_delta is null then raise exception 'Unknown adjustment type'; end if;
  if v_delta = 0 then raise exception 'Count matches the system — nothing to adjust'; end if;
  v_new := public.kibali__move(v_shop, p_product_id, v_kind, 'ADJ', v_delta, trim(p_reason), p_mode, null, null);
  perform public.kibali__alert(v_shop, 'adjust', null, null,
    format('%s (%s): %s%s %s (balance now %s) — %s', v_name, v_kind, case when v_delta > 0 then '+' else '' end, v_delta, v_unit, v_new, trim(p_reason)));
  return v_new;
end $$;

revoke all on function public.kibali_receive_stock(text,int,text,text)      from public, anon;
revoke all on function public.kibali_adjust_stock(text,text,int,text,text)  from public, anon;
grant execute on function public.kibali_receive_stock(text,int,text,text)     to authenticated;
grant execute on function public.kibali_adjust_stock(text,text,int,text,text) to authenticated;

-- 7. reserved per product AND kind -------------------------------------
drop view if exists public.kibali_reserved;
create view public.kibali_reserved with (security_invoker = true) as
  select i.shop_id, i.product_id, i.kind, sum(i.qty - i.released)::int as reserved
  from public.release_order_items i
  join public.release_orders o on o.id = i.order_id
  where o.status in ('PENDING','PARTIAL')
  group by i.shop_id, i.product_id, i.kind;
grant select on public.kibali_reserved to authenticated;

commit;
