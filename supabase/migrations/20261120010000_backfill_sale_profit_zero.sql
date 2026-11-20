-- Web Cashier sales were saved with total_profit 0 (column default) while their items had profit.
-- Recompute items (wholesale = box cost, retail = box cost / box_qty) and the sale total,
-- only for sales whose total is 0/empty but whose items show profit.
with target as (
  select s.id from sales s
  join sale_items si on si.sale_id = s.id
  where coalesce(s.total_profit,0) = 0
  group by s.id
  having sum(coalesce(si.line_profit,0)) <> 0
),
fix as (
  select si.id,
         round(si.line_total - si.qty * case when si.sale_type = 'wholesale' then coalesce(si.buy_price,0)
                                       else coalesce(si.buy_price,0) / greatest(coalesce(p.box_qty,1),1) end, 2) as lp
  from sale_items si
  join target t on t.id = si.sale_id
  left join products p on p.id = si.product_id
)
update sale_items si set line_profit = fix.lp from fix where fix.id = si.id;

update sales s
set total_profit = round(x.p - coalesce(s.discount,0), 2)
from (select sale_id, sum(coalesce(line_profit,0)) p from sale_items group by sale_id) x
where x.sale_id = s.id and coalesce(s.total_profit,0) = 0 and x.p <> 0;
