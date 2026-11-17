-- Serengeti Admin: owner contacts (name, phone, email) on the shops list.
-- Run after 20261117010000_platform_admin_suite.sql.

create or replace function public.platform_list_shops()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.platform_is_admin() then raise exception 'Huna ruhusa ya Serengeti admin'; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'name', s.name,
      'phone', to_jsonb(s)->>'phone',
      'address', to_jsonb(s)->>'address',
      'subscription', to_jsonb(s)->>'subscription',
      'sub_plan', to_jsonb(s)->>'sub_plan',
      'sub_expires_at', to_jsonb(s)->>'sub_expires_at',
      'trial_started_at', to_jsonb(s)->>'trial_started_at',
      'created_at', to_jsonb(s)->>'created_at',
      'status', public.td_sub_status(to_jsonb(s)->>'subscription', (to_jsonb(s)->>'sub_expires_at')::timestamptz),
      'pos', public.td_package(s.id) in ('pos', 'both'),
      'store', public.td_package(s.id) in ('store', 'both'),
      'owner', coalesce(o.full_name, o.email),
      'owner_name', o.full_name,
      'owner_phone', o.phone,
      'owner_email', o.email,
      'sales_30d', (select count(*) from public.sales x where x.shop_id = s.id and x.created_at > now() - interval '30 days'),
      'revenue_30d', (select coalesce(sum((to_jsonb(x)->>'total')::numeric), 0) from public.sales x where x.shop_id = s.id and x.created_at > now() - interval '30 days'),
      'last_sale_at', (select max(x.created_at) from public.sales x where x.shop_id = s.id),
      'paid_total', (select coalesce(sum(p.amount), 0) from public.shop_payments p where p.shop_id = s.id and not p.voided)
    ) order by s.name)
    from public.shops s
    left join lateral (
      -- The owner: shop_owners first, then the shop's admin user
      select u.full_name, u.email, to_jsonb(u)->>'phone' as phone
      from public.app_users u
      where u.id in (select so.user_id from public.shop_owners so where so.shop_id = s.id)
         or (u.shop_id = s.id and u.role in ('shop_admin', 'super_admin'))
      order by (u.id in (select so.user_id from public.shop_owners so where so.shop_id = s.id)) desc, u.role
      limit 1
    ) o on true
  ), '[]'::jsonb);
end $$;

grant execute on function public.platform_list_shops() to authenticated;
