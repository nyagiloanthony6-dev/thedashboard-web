-- Daily cash: cashier limits.
--   * Admins/owners: full report, can set petty cash for any day.
--   * Cashiers and other staff: last 3 days only, can set petty cash for TODAY only.
--   * Report shows who set each petty cash amount.
-- Run after 20261120020000_daily_cash.sql. Safe to run more than once.

create or replace function public.td_is_shop_manager(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_shop is not null and (
    exists (select 1 from public.app_users where id = auth.uid() and shop_id = p_shop and role in ('super_admin','shop_admin')) or
    exists (select 1 from public.shop_owners where user_id = auth.uid() and shop_id = p_shop) or
    coalesce(public.platform_is_admin(), false)
  )
$$;
grant execute on function public.td_is_shop_manager(uuid) to authenticated;

-- Direct table writes: managers only (staff go through td_set_petty_cash)
drop policy if exists td_daily_cash_insert on public.daily_cash;
drop policy if exists td_daily_cash_update on public.daily_cash;
drop policy if exists td_daily_cash_delete on public.daily_cash;
create policy td_daily_cash_insert on public.daily_cash for insert to authenticated with check (public.td_is_shop_manager(shop_id));
create policy td_daily_cash_update on public.daily_cash for update to authenticated using (public.td_is_shop_manager(shop_id)) with check (public.td_is_shop_manager(shop_id));
create policy td_daily_cash_delete on public.daily_cash for delete to authenticated using (public.td_is_shop_manager(shop_id));

create or replace function public.td_set_petty_cash(p_shop uuid, p_day date, p_amount numeric, p_note text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_today date := (now() at time zone 'Africa/Dar_es_Salaam')::date;
begin
  if not public.td_can_shop(p_shop) then raise exception 'Not allowed for this shop'; end if;
  if coalesce(p_amount,0) < 0 then raise exception 'Petty cash cannot be negative'; end if;
  if not public.td_is_shop_manager(p_shop) and p_day <> v_today then
    raise exception 'Cashiers can only set today''s petty cash. Ask the shop admin to change other days.';
  end if;
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

-- Report now also returns who set the petty cash; staff are limited to the last 3 days
drop function if exists public.td_daily_cash(uuid, date, date);
create function public.td_daily_cash(p_shop uuid, p_from date, p_to date)
returns table(day date, sales_count int, revenue numeric, loan numeric, cash_in numeric,
              expenses numeric, petty_cash numeric, repaid numeric, remained numeric, note text, set_by text)
language sql stable security definer set search_path = public as $$
  with ok as (select public.td_can_shop(p_shop) as yes, public.td_is_shop_manager(p_shop) as mgr,
                     (now() at time zone 'Africa/Dar_es_Salaam')::date as today),
  rng as (select case when ok.mgr then p_from else greatest(p_from, ok.today - 2) end as f,
                 case when ok.mgr then p_to   else least(p_to, ok.today) end as t from ok),
  days as (select d::date as day from rng, generate_series(rng.f, rng.t, interval '1 day') d),
  s as (
    select coalesce(nullif(x.sale_date::text,'')::date, (x.created_at at time zone 'Africa/Dar_es_Salaam')::date) as day,
           count(*)::int as n,
           sum(coalesce(x.total,0)) as revenue,
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
  )
  select d.day, coalesce(s.n,0), coalesce(s.revenue,0), coalesce(s.loan,0),
         coalesce(s.revenue,0) - coalesce(s.loan,0),
         coalesce(e.amt,0), coalesce(dc.petty_cash,0), coalesce(r.amt,0),
         coalesce(s.revenue,0) - coalesce(s.loan,0) - coalesce(e.amt,0) - coalesce(dc.petty_cash,0) + coalesce(r.amt,0),
         dc.note,
         au.full_name
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
