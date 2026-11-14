-- Fix: "new row violates row-level security policy for table customer_contacts"
-- Staff and owners may manage contacts of customers that belong to their shop.
-- Adds policies (existing ones are kept; Postgres allows a row if ANY policy allows it).
-- Safe to run more than once.

-- Can the signed-in user work in this shop? (staff row or owner link)
create or replace function public.td_can_shop(p_shop uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_shop is not null and (
    exists (select 1 from public.app_users  where id = auth.uid()      and shop_id = p_shop) or
    exists (select 1 from public.shop_owners where user_id = auth.uid() and shop_id = p_shop)
  )
$$;
grant execute on function public.td_can_shop(uuid) to authenticated;

alter table public.customer_contacts enable row level security;

drop policy if exists td_contacts_select on public.customer_contacts;
drop policy if exists td_contacts_insert on public.customer_contacts;
drop policy if exists td_contacts_update on public.customer_contacts;
drop policy if exists td_contacts_delete on public.customer_contacts;

create policy td_contacts_select on public.customer_contacts for select to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and public.td_can_shop(c.shop_id)));
create policy td_contacts_insert on public.customer_contacts for insert to authenticated
  with check (exists (select 1 from public.customers c where c.id = customer_id and public.td_can_shop(c.shop_id)));
create policy td_contacts_update on public.customer_contacts for update to authenticated
  using      (exists (select 1 from public.customers c where c.id = customer_id and public.td_can_shop(c.shop_id)))
  with check (exists (select 1 from public.customers c where c.id = customer_id and public.td_can_shop(c.shop_id)));
create policy td_contacts_delete on public.customer_contacts for delete to authenticated
  using (exists (select 1 from public.customers c where c.id = customer_id and public.td_can_shop(c.shop_id)));

-- If the table has a shop_id column, fill it from the customer so the app needn't send it
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'customer_contacts' and column_name = 'shop_id') then
    create or replace function public.td_contacts_fill_shop()
    returns trigger language plpgsql security definer set search_path = public as $f$
    begin
      if new.shop_id is null then
        select c.shop_id into new.shop_id from public.customers c where c.id = new.customer_id;
      end if;
      return new;
    end $f$;
    drop trigger if exists td_contacts_fill_shop on public.customer_contacts;
    create trigger td_contacts_fill_shop before insert on public.customer_contacts
      for each row execute function public.td_contacts_fill_shop();
  end if;
end $$;
