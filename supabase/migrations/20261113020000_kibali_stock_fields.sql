-- Kibali fix: use the same quantity field as TheDashboard's Stock page.
--   product_type = 'wholesale' -> wholesale_stock
--   otherwise                  -> retail_stock (falls back to stock), and
--                                 stock is kept equal to retail_stock
-- Before this, Kibali read and updated only `stock`, so wholesale items
-- (bulk import, vendors, warehouse transfers) showed 0.
-- Safe to run more than once.

begin;

-- Current quantity of a product, exactly as the Stock page shows it
create or replace function public.kibali_qty(p_type text, p_retail int, p_wholesale int, p_stock int)
returns int language sql immutable as $$
  select case when p_type = 'wholesale' then coalesce(p_wholesale, 0)
              when coalesce(p_retail, 0) <> 0 then p_retail
              else coalesce(p_stock, 0) end
$$;

create or replace function public.kibali__move(
  p_shop uuid, p_product_id text, p_type text, p_delta int,
  p_reference text, p_note text, p_order uuid, p_order_no text)
returns int language plpgsql security definer set search_path = public as $$
declare
  v_name text; v_unit text; v_ptype text; v_cur int; v_new int;
begin
  select name, coalesce(unit, 'unit'), product_type,
         public.kibali_qty(product_type, retail_stock, wholesale_stock, stock)
    into v_name, v_unit, v_ptype, v_cur
  from public.products
  where id::text = p_product_id and shop_id = p_shop
  for update;
  if not found then raise exception 'Product not found in this shop'; end if;

  v_new := v_cur + p_delta;
  if v_new < 0 then
    perform public.kibali__alert(p_shop, 'negative', p_order, p_order_no,
      format('%s: system stock was %s but %s were taken out — stock count needed', v_name, v_cur, -p_delta));
    v_new := 0;
  end if;

  if v_ptype = 'wholesale' then
    update public.products set wholesale_stock = v_new where id::text = p_product_id;
  else
    update public.products set retail_stock = v_new, stock = v_new where id::text = p_product_id;
  end if;

  insert into public.stock_movements
    (shop_id, product_id, product_name, unit, type, qty, balance_after, reference, note, order_id, created_by, created_by_name)
  select p_shop, p.id, v_name, v_unit, p_type, p_delta, v_new, p_reference, p_note, p_order, auth.uid(), public.kibali_my_name()
  from public.products p where p.id::text = p_product_id;

  return v_new;
end $$;
revoke all on function public.kibali__move(uuid,text,text,int,text,text,uuid,text) from public, anon, authenticated;

create or replace function public.kibali_adjust_stock(p_product_id text, p_mode text, p_qty int, p_reason text)
returns int language plpgsql security definer set search_path = public as $$
declare v_shop uuid := public.kibali_my_shop(); v_cur int; v_name text; v_unit text; v_delta int; v_new int;
begin
  if not public.kibali_can('stock.adjust') then raise exception 'Only the owner can adjust stock'; end if;
  if coalesce(trim(p_reason),'') = '' then raise exception 'A reason is required'; end if;
  if p_qty is null or p_qty < 0 then raise exception 'Enter a whole number'; end if;
  select public.kibali_qty(product_type, retail_stock, wholesale_stock, stock), name, coalesce(unit,'unit')
    into v_cur, v_name, v_unit
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

commit;
