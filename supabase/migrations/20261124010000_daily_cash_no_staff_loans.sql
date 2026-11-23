-- Daily cash report no longer counts staff loans or their repayments:
-- staff loans are paid from the bank and managed separately.
-- (staff_loan / staff_repaid columns are kept for compatibility and always return 0.)
-- Run after 20261124000000_staff_loan_move_writeoff.sql. Safe to run more than once.

create or replace function public.td_daily_cash(p_shop uuid, p_from date, p_to date)
returns table(day date, sales_count int, revenue numeric, loan numeric, cash_in numeric,
              expenses numeric, petty_cash numeric, repaid numeric, remained numeric, note text, set_by text,
              staff_loan numeric, staff_repaid numeric)
language sql stable security definer set search_path = public as $$
  with ok as (select public.td_can_shop(p_shop) as yes, public.td_is_shop_manager(p_shop) as mgr,
                     (now() at time zone 'Africa/Dar_es_Salaam')::date as today),
  rng as (select case when ok.mgr then p_from else greatest(p_from, ok.today - 2) end as f,
                 case when ok.mgr then p_to   else least(p_to, ok.today) end as t from ok),
  days as (select d::date as day from rng, generate_series(rng.f, rng.t, interval '1 day') d),
  s as (
    select coalesce(nullif(x.sale_date::text,'')::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) as day,
           count(*)::int as n, sum(coalesce(x.total,0)) as revenue,
           sum(case when x.payment_method = 'loan' then coalesce(x.total,0)
                    when x.payment_method = 'split' then coalesce(nullif(x.loan_balance,0), greatest(coalesce(x.total,0) - coalesce(x.cash_paid,0), 0))
                    else 0 end) as loan
    from public.sales x, rng
    where x.shop_id = p_shop
      and coalesce(nullif(x.sale_date::text,'')::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) between rng.f and rng.t
    group by 1
  ),
  e as (
    select coalesce(x.expense_date::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) as day, sum(coalesce(x.amount,0)) as amt
    from public.expenses x, rng
    where x.shop_id = p_shop
      and coalesce(x.category,'') <> 'Staff loan written off'
      and coalesce(x.expense_date::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) between rng.f and rng.t
    group by 1
  ),
  r as (
    select lp.payment_date::date as day, sum(coalesce(lp.amount,0)) as amt
    from public.loan_payments lp join public.sales x on x.id = lp.sale_id, rng
    where x.shop_id = p_shop and lp.payment_date::date between rng.f and rng.t
    group by 1
  )
  select d.day, coalesce(s.n,0), coalesce(s.revenue,0), coalesce(s.loan,0),
         coalesce(s.revenue,0) - coalesce(s.loan,0),
         coalesce(e.amt,0), coalesce(dc.petty_cash,0), coalesce(r.amt,0),
         coalesce(s.revenue,0) - coalesce(s.loan,0) - coalesce(e.amt,0) - coalesce(dc.petty_cash,0) + coalesce(r.amt,0),
         dc.note, au.full_name,
         0::numeric, 0::numeric
  from days d cross join ok
  left join s on s.day = d.day
  left join e on e.day = d.day
  left join r on r.day = d.day
  left join public.daily_cash dc on dc.shop_id = p_shop and dc.day = d.day
  left join public.app_users au on au.id = dc.updated_by
  where ok.yes
  order by d.day desc
$$;
grant execute on function public.td_daily_cash(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
