-- Daily cash report: revenue, loans, cash collected, expenses, petty cash (entered per day),
-- loan repayments received, and cash remained.
--   cash collected = revenue − loans given that day
--   cash remained  = revenue − loans − expenses − petty cash + loan repayments received that day
-- Safe to run more than once.

create table if not exists public.daily_cash (
  shop_id    uuid not null references public.shops(id) on delete cascade,
  day        date not null,
  petty_cash numeric not null default 0,
  note       text,
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  primary key (shop_id, day)
);

alter table public.daily_cash enable row level security;
drop policy if exists td_daily_cash_select on public.daily_cash;
drop policy if exists td_daily_cash_insert on public.daily_cash;
drop policy if exists td_daily_cash_update on public.daily_cash;
drop policy if exists td_daily_cash_delete on public.daily_cash;
create policy td_daily_cash_select on public.daily_cash for select to authenticated using (public.td_can_shop(shop_id));
create policy td_daily_cash_insert on public.daily_cash for insert to authenticated with check (public.td_can_shop(shop_id));
create policy td_daily_cash_update on public.daily_cash for update to authenticated using (public.td_can_shop(shop_id)) with check (public.td_can_shop(shop_id));
create policy td_daily_cash_delete on public.daily_cash for delete to authenticated using (public.td_can_shop(shop_id));

-- Save petty cash for a day (0 or empty removes it)
create or replace function public.td_set_petty_cash(p_shop uuid, p_day date, p_amount numeric, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.td_can_shop(p_shop) then raise exception 'Not allowed for this shop'; end if;
  if coalesce(p_amount,0) = 0 and coalesce(trim(p_note),'') = '' then
    delete from public.daily_cash where shop_id = p_shop and day = p_day;
  else
    insert into public.daily_cash(shop_id, day, petty_cash, note, updated_by, updated_at)
    values (p_shop, p_day, coalesce(p_amount,0), nullif(trim(p_note),''), auth.uid(), now())
    on conflict (shop_id, day) do update
      set petty_cash = excluded.petty_cash, note = excluded.note, updated_by = auth.uid(), updated_at = now();
  end if;
end $$;
grant execute on function public.td_set_petty_cash(uuid, date, numeric, text) to authenticated;

-- One row per day between p_from and p_to (inclusive), newest first
create or replace function public.td_daily_cash(p_shop uuid, p_from date, p_to date)
returns table(day date, sales_count int, revenue numeric, loan numeric, cash_in numeric,
              expenses numeric, petty_cash numeric, repaid numeric, remained numeric, note text)
language sql stable security definer set search_path = public as $$
  with ok as (select public.td_can_shop(p_shop) as yes),
  days as (select d::date as day from generate_series(p_from, p_to, interval '1 day') d),
  s as (
    select coalesce(nullif(x.sale_date::text,'')::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) as day,
           count(*)::int as n,
           sum(coalesce(x.total,0)) as revenue,
           sum(case when x.payment_method = 'loan' then coalesce(x.total,0)
                    when x.payment_method = 'split' then coalesce(nullif(x.loan_balance,0), greatest(coalesce(x.total,0) - coalesce(x.cash_paid,0), 0))
                    else 0 end) as loan
    from public.sales x
    where x.shop_id = p_shop
      and coalesce(nullif(x.sale_date::text,'')::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) between p_from and p_to
    group by 1
  ),
  e as (
    select coalesce(x.expense_date::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) as day, sum(coalesce(x.amount,0)) as amt
    from public.expenses x
    where x.shop_id = p_shop
      and coalesce(x.expense_date::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) between p_from and p_to
    group by 1
  ),
  r as (
    select lp.payment_date::date as day, sum(coalesce(lp.amount,0)) as amt
    from public.loan_payments lp join public.sales x on x.id = lp.sale_id
    where x.shop_id = p_shop and lp.payment_date::date between p_from and p_to
    group by 1
  )
  select d.day,
         coalesce(s.n,0),
         coalesce(s.revenue,0),
         coalesce(s.loan,0),
         coalesce(s.revenue,0) - coalesce(s.loan,0),
         coalesce(e.amt,0),
         coalesce(dc.petty_cash,0),
         coalesce(r.amt,0),
         coalesce(s.revenue,0) - coalesce(s.loan,0) - coalesce(e.amt,0) - coalesce(dc.petty_cash,0) + coalesce(r.amt,0),
         dc.note
  from days d
  cross join ok
  left join s on s.day = d.day
  left join e on e.day = d.day
  left join r on r.day = d.day
  left join public.daily_cash dc on dc.shop_id = p_shop and dc.day = d.day
  where ok.yes
  order by d.day desc
$$;
grant execute on function public.td_daily_cash(uuid, date, date) to authenticated;

notify pgrst, 'reload schema';
