-- TheDashboard Store plan (Store only, one shop). Run after 20261117030000_plans_branches.sql.
-- Reuses the old sample "Store" plan when it exists, so its payment history stays linked.

update public.platform_plans
set code = 'store', name = 'Store Pack', package = 'store', includes_store = true, max_shops = 1,
    features = null, active = true, sort = 40,
    description = coalesce(description, 'TheDashboard Store: oda za kutoa store, QR na namba ya siri, pokea mzigo, ripoti')
where code is null and name = 'Store'
  and not exists (select 1 from public.platform_plans where code = 'store');

insert into public.platform_plans (code, name, package, monthly_price, sort, features, max_shops, includes_store, description)
select 'store', 'Store Pack', 'store', 0, 40, null, 1, true,
       'TheDashboard Store: oda za kutoa store, QR na namba ya siri, pokea mzigo, ripoti'
where not exists (select 1 from public.platform_plans where code = 'store');

update public.shops set sub_plan = 'Store Pack' where sub_plan = 'Store';
update public.shops s set plan_id = p.id from public.platform_plans p
where p.code = 'store' and s.plan_id is null and s.sub_plan = 'Store Pack';

-- Setting a plan also sets the package: Store plans switch POS off and Store on,
-- POS + Store plans switch both on, POS plans make sure POS is on (Store left as it is).
create or replace function public.td_apply_plan(p_shop uuid, p_plan uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_name text; v_store boolean; v_pkg text;
begin
  select name, includes_store, package into v_name, v_store, v_pkg from public.platform_plans where id = p_plan;
  if v_name is null then return; end if;
  update public.shops set plan_id = p_plan, sub_plan = v_name where id = p_shop;

  insert into public.shop_modules (shop_id, module, active, expires_at, updated_at)
  select s.id, 'pos', v_pkg <> 'store', null, now() from public.shops s where s.id = p_shop or s.parent_shop_id = p_shop
  on conflict (shop_id, module) do update set active = excluded.active, expires_at = null, updated_at = now();

  if v_store or v_pkg in ('store', 'both') then
    insert into public.shop_modules (shop_id, module, active, expires_at, updated_at)
    select s.id, 'kibali', true, null, now() from public.shops s where s.id = p_shop or s.parent_shop_id = p_shop
    on conflict (shop_id, module) do update set active = true, expires_at = null, updated_at = now();
  end if;
end $$;
revoke all on function public.td_apply_plan(uuid, uuid) from public, anon, authenticated;
