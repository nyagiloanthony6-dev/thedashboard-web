-- Staff loans (advances): money taken by staff, repaid in parts.
-- Counted as cash out on the day given and cash in on the day repaid (daily cash report),
-- but NOT as an expense against profit (it is owed back).
-- Needs td_is_shop_manager from 20261120030000_daily_cash_cashier.sql. Safe to run more than once.

create table if not exists public.staff_loans (
  id          uuid primary key default gen_random_uuid(),
  shop_id     uuid not null references public.shops(id) on delete cascade,
  staff_id    uuid,
  staff_name  text not null,
  amount      numeric not null check (amount > 0),
  note        text,
  loan_date   date not null default ((now() at time zone 'Africa/Dar_es_Salaam')::date),
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists staff_loans_shop_idx on public.staff_loans(shop_id, loan_date desc);

create table if not exists public.staff_loan_payments (
  id          uuid primary key default gen_random_uuid(),
  loan_id     uuid not null references public.staff_loans(id) on delete cascade,
  shop_id     uuid not null references public.shops(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  paid_date   date not null default ((now() at time zone 'Africa/Dar_es_Salaam')::date),
  note        text,
  received_by uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists staff_loan_payments_loan_idx on public.staff_loan_payments(loan_id);
create index if not exists staff_loan_payments_shop_idx on public.staff_loan_payments(shop_id, paid_date);

alter table public.staff_loans enable row level security;
alter table public.staff_loan_payments enable row level security;
do $$ declare t text; begin
  foreach t in array array['staff_loans','staff_loan_payments'] loop
    execute format('drop policy if exists %I on public.%I', t||'_sel', t);
    execute format('drop policy if exists %I on public.%I', t||'_ins', t);
    execute format('drop policy if exists %I on public.%I', t||'_upd', t);
    execute format('drop policy if exists %I on public.%I', t||'_del', t);
    execute format('create policy %I on public.%I for select to authenticated using (public.td_is_shop_manager(shop_id))', t||'_sel', t);
    execute format('create policy %I on public.%I for insert to authenticated with check (public.td_is_shop_manager(shop_id))', t||'_ins', t);
    execute format('create policy %I on public.%I for update to authenticated using (public.td_is_shop_manager(shop_id)) with check (public.td_is_shop_manager(shop_id))', t||'_upd', t);
    execute format('create policy %I on public.%I for delete to authenticated using (public.td_is_shop_manager(shop_id))', t||'_del', t);
  end loop;
end $$;

-- Record a repayment; refuses more than the balance
create or replace function public.td_staff_loan_pay(p_loan uuid, p_amount numeric, p_date date default null, p_note text default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare v_shop uuid; v_amt numeric; v_paid numeric;
begin
  select shop_id, amount into v_shop, v_amt from public.staff_loans where id = p_loan;
  if v_shop is null then raise exception 'Loan not found'; end if;
  if not public.td_is_shop_manager(v_shop) then raise exception 'Only the shop admin can record staff loan repayments'; end if;
  if coalesce(p_amount,0) <= 0 then raise exception 'Enter an amount above 0'; end if;
  select coalesce(sum(amount),0) into v_paid from public.staff_loan_payments where loan_id = p_loan;
  if p_amount > v_amt - v_paid then raise exception 'That is more than the balance (%).', to_char(v_amt - v_paid, 'FM999,999,999'); end if;
  insert into public.staff_loan_payments(loan_id, shop_id, amount, paid_date, note)
  values (p_loan, v_shop, p_amount, coalesce(p_date, (now() at time zone 'Africa/Dar_es_Salaam')::date), nullif(trim(p_note),''));
  return v_amt - v_paid - p_amount;
end $$;
grant execute on function public.td_staff_loan_pay(uuid, numeric, date, text) to authenticated;

-- Daily cash: staff loans out, staff repayments in
drop function if exists public.td_daily_cash(uuid, date, date);
create function public.td_daily_cash(p_shop uuid, p_from date, p_to date)
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
