-- Loan sales: staff guarantor and waivers. Run after 20261117040000_store_plan.sql. Safe to re-run.
--
-- • loan_guarantor_id / loan_guarantor_name: the staff member responsible for a loan (or split) sale.
-- • loan_waiver: amount forgiven. It lowers what the customer owes, is NOT money received
--   (loan_payments stays cash only), and is taken off the sale's profit.

alter table public.sales add column if not exists loan_guarantor_id uuid;
alter table public.sales add column if not exists loan_guarantor_name text;
alter table public.sales add column if not exists loan_waiver numeric not null default 0;
alter table public.sales add column if not exists loan_waiver_note text;
alter table public.sales add column if not exists loan_waived_at timestamptz;
alter table public.sales add column if not exists loan_waived_by uuid;

-- Owner/admin forgives part or all of a loan balance
drop function if exists public.td_waive_loan(uuid, numeric, text);
-- p_sale is text so it works whatever type sales.id has
create or replace function public.td_waive_loan(p_sale text, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v record; v_paid numeric; v_owed numeric; v_left numeric; v_role text; v_my_shop uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into v from public.sales where id::text = p_sale for update;
  if not found then raise exception 'Sale not found'; end if;

  select role, shop_id into v_role, v_my_shop from public.app_users where id = auth.uid();
  if not (
       (coalesce(v_role, '') in ('shop_admin', 'super_admin') and v_my_shop = v.shop_id)
    or exists (select 1 from public.shop_owners so where so.user_id = auth.uid() and so.shop_id = v.shop_id)
  ) then
    raise exception 'Only the shop owner or admin can waive a loan';
  end if;

  if coalesce(v.payment_method, '') not in ('loan', 'split') then raise exception 'This sale is not a loan'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'Enter the amount to waive'; end if;
  if coalesce(trim(p_note), '') = '' then raise exception 'Write the reason for the waiver'; end if;

  select coalesce(sum(amount), 0) into v_paid from public.loan_payments where sale_id::text = p_sale;
  v_owed := case when v.payment_method = 'split'
                 then coalesce(nullif(to_jsonb(v)->>'loan_balance', '')::numeric, greatest(0, coalesce(v.total, 0) - coalesce(nullif(to_jsonb(v)->>'cash_paid', '')::numeric, 0)))
                 else coalesce(v.total, 0) end
            - v_paid - coalesce(v.loan_waiver, 0);
  if p_amount > v_owed + 0.0001 then raise exception 'Waiver is more than the balance (%)', round(greatest(v_owed, 0)); end if;
  v_left := greatest(0, v_owed - p_amount);

  update public.sales set
    loan_waiver = coalesce(loan_waiver, 0) + p_amount,
    loan_waiver_note = case when coalesce(loan_waiver_note, '') = '' then trim(p_note) else loan_waiver_note || ' | ' || trim(p_note) end,
    loan_waived_at = now(), loan_waived_by = auth.uid(),
    total_profit = coalesce(total_profit, 0) - p_amount,
    loan_paid = (v_left <= 0),
    loan_paid_at = case when v_left <= 0 then coalesce(loan_paid_at, now()) else null end
  where id::text = p_sale;

  return jsonb_build_object('waived', p_amount, 'total_waiver', coalesce(v.loan_waiver, 0) + p_amount, 'owing', v_left);
end $$;

revoke all on function public.td_waive_loan(text, numeric, text) from public, anon;
grant execute on function public.td_waive_loan(text, numeric, text) to authenticated;
