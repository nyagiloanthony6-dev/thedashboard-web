-- TheDashboard Store: record POS sales in the stock movement history
--
-- For shops with the Store module (internal name 'kibali'), POS sales, credit
-- batches and field-order fulfilment take stock off through kibali_sell()
-- instead of writing the number directly. Each line is logged as a SALE
-- movement with the sale reference, under the same row lock as releases,
-- so the history is complete and nothing is deducted twice.
-- POS-only shops are unaffected (the app keeps its old behaviour for them).
-- Safe to run more than once.

begin;

-- 1. New movement type: SALE ------------------------------------------
do $$ begin
  if exists (select 1 from pg_constraint where conname = 'stock_movements_type_check') then
    alter table public.stock_movements drop constraint stock_movements_type_check;
  end if;
  alter table public.stock_movements add constraint stock_movements_type_check
    check (type in ('IN','OUT','ADJ','SALE'));
end $$;

-- 2. Permission for selling ---------------------------------------------
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

-- 3. Sell: p_items = [{"product_id": "...", "qty": 3, "kind": "retail"|"wholesale"}]
--    Returns [{product_id, kind, balance}]
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
