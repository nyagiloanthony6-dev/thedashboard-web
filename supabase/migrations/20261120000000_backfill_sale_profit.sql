-- Sales made on the web Cashier page were saved without total_profit (it showed as 0),
-- and their item profit used the piece cost even for wholesale boxes.
-- Recompute both, only for sales whose total_profit is missing.
-- Web cashier stored sale_items.buy_price as the product's box price and line_total before discount.
with fix as (
  select si.id,
         round(si.line_total - si.qty * case when si.sale_type = 'wholesale' then coalesce(si.buy_price,0)
                                       else coalesce(si.buy_price,0) / greatest(coalesce(p.box_qty,1),1) end, 2) as lp
  from sale_items si
  join sales s on s.id = si.sale_id
  left join products p on p.id = si.product_id
  where s.total_profit is null
)
update sale_items si set line_profit = fix.lp from fix where fix.id = si.id;

update sales s
set total_profit = round(x.p - coalesce(s.discount,0), 2)
from (select sale_id, sum(coalesce(line_profit,0)) p from sale_items group by sale_id) x
where x.sale_id = s.id and s.total_profit is null;
