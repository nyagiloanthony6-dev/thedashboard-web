-- Staff loans: move an expense into a staff loan, and write off a staff loan.
-- Run after 20261123000000_staff_loans.sql. Safe to run more than once.

alter table public.staff_loans add column if not exists source_expense text;
alter table public.staff_loans add column if not exists written_off numeric not null default 0;
alter table public.staff_loans add column if not exists written_off_at timestamptz;
alter table public.staff_loans add column if not exists written_off_by uuid;
alter table public.staff_loans add column if not exists written_off_note text;

-- Expense -> staff loan, in one step (expense removed, loan created with the same amount and date)
create or replace function public.td_expense_to_staff_loan(p_expense text, p_staff_id uuid, p_staff_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare e record; v_id uuid; v_by text;
begin
  select * into e from public.expenses where id::text = p_expense;
  if e is null then raise exception 'Expense not found'; end if;
  if not public.td_is_shop_manager(e.shop_id) then raise exception 'Only the shop admin can move expenses to staff loans'; end if;
  if coalesce(trim(p_staff_name),'') = '' then raise exception 'Choose the staff member'; end if;
  if coalesce(e.amount,0) <= 0 then raise exception 'This expense has no amount'; end if;
  select full_name into v_by from public.app_users where id = auth.uid();
  insert into public.staff_loans(shop_id, staff_id, staff_name, amount, note, loan_date, source_expense)
  values (e.shop_id, p_staff_id, trim(p_staff_name), e.amount,
          concat_ws(' · ', nullif(trim(e.description),''),
                    format('Moved from expense (%s, %s)%s', coalesce(e.category,'Other'),
                           to_char(coalesce(e.expense_date, (e.created_at at time zone 'Africa/Dar_es_Salaam')::date),'DD Mon'),
                           case when v_by is not null then ' by '||v_by else '' end)),
          coalesce(e.expense_date, (e.created_at at time zone 'Africa/Dar_es_Salaam')::date), e.id::text)
  returning id into v_id;
  delete from public.expenses where id = e.id;
  return v_id;
end $$;
grant execute on function public.td_expense_to_staff_loan(text, uuid, text) to authenticated;

-- Write off what is still unpaid: becomes an expense today (lowers profit), not cash out
create or replace function public.td_staff_loan_write_off(p_loan uuid, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare l record; v_paid numeric; v_bal numeric; v_today date := (now() at time zone 'Africa/Dar_es_Salaam')::date;
begin
  select * into l from public.staff_loans where id = p_loan;
  if l is null then raise exception 'Loan not found'; end if;
  if not public.td_is_shop_manager(l.shop_id) then raise exception 'Only the shop admin can write off staff loans'; end if;
  select coalesce(sum(amount),0) into v_paid from public.staff_loan_payments where loan_id = p_loan;
  v_bal := l.amount - v_paid - coalesce(l.written_off,0);
  if v_bal <= 0 then raise exception 'Nothing left to write off'; end if;
  insert into public.expenses(shop_id, added_by, added_by_role, category, description, amount, expense_date, expense_type)
  values (l.shop_id, auth.uid(), 'shop_admin', 'Staff loan written off',
          concat_ws(' · ', l.staff_name, nullif(trim(p_note),'')), v_bal, v_today, 'opex');
  update public.staff_loans set written_off = coalesce(written_off,0) + v_bal, written_off_at = now(),
         written_off_by = auth.uid(), written_off_note = nullif(trim(p_note),'') where id = p_loan;
  return v_bal;
end $$;
grant execute on function public.td_staff_loan_write_off(uuid, text) to authenticated;

-- Repayments: balance now also subtracts anything written off
create or replace function public.td_staff_loan_pay(p_loan uuid, p_amount numeric, p_date date default null, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_amt numeric; v_paid numeric; v_off numeric;
begin
  select shop_id, amount, coalesce(written_off,0) into v_shop, v_amt, v_off from public.staff_loans where id = p_loan;
  if v_shop is null then raise exception 'Loan not found'; end if;
  if not public.td_is_shop_manager(v_shop) then raise exception 'Only the shop admin can record staff loan repayments'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Enter an amount above 0'; end if;
  select coalesce(sum(amount),0) into v_paid from public.staff_loan_payments where loan_id = p_loan;
  if p_amount > v_amt - v_paid - v_off then raise exception 'That is more than the balance (%).', to_char(v_amt - v_paid - v_off, 'FM999,999,999'); end if;
  insert into public.staff_loan_payments(loan_id, shop_id, amount, paid_date, note)
  values (p_loan, v_shop, p_amount, coalesce(p_date, (now() at time zone 'Africa/Dar_es_Salaam')::date), nullif(trim(p_note),''));
  return v_amt - v_paid - v_off - p_amount;
end $$;
grant execute on function public.td_staff_loan_pay(uuid, numeric, date, text) to authenticated;

-- Daily cash: write-offs are not cash (the cash left when the loan was given), so skip them
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
  ),
  sl as (select loan_date as day, sum(amount) as amt from public.staff_loans, rng where shop_id = p_shop and loan_date between rng.f and rng.t group by 1),
  sp as (select paid_date as day, sum(amount) as amt from public.staff_loan_payments, rng where shop_id = p_shop and paid_date between rng.f and rng.t group by 1)
  select d.day, coalesce(s.n,0), coalesce(s.revenue,0), coalesce(s.loan,0),
         coalesce(s.revenue,0) - coalesce(s.loan,0),
         coalesce(e.amt,0), coalesce(dc.petty_cash,0), coalesce(r.amt,0),
         coalesce(s.revenue,0) - coalesce(s.loan,0) - coalesce(e.amt,0) - coalesce(dc.petty_cash,0) + coalesce(r.amt,0)
           - coalesce(sl.amt,0) + coalesce(sp.amt,0),
         dc.note, au.full_name,
         coalesce(sl.amt,0), coalesce(sp.amt,0)
  from days d cross join ok
  left join s on s.day = d.day
  left join e on e.day = d.day
  left join r on r.day = d.day
  left join sl on sl.day = d.day
  left join sp on sp.day = d.day
  left join public.daily_cash dc on dc.shop_id = p_shop and dc.day = d.day
  left join public.app_users au on au.id = dc.updated_by
  where ok.yes
  order by d.day desc
$$;
grant execute on function public.td_daily_cash(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
