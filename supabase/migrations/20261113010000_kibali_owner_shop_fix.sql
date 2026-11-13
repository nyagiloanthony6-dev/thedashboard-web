-- Kibali fix: owners linked to their shop only through shop_owners
-- (app_users.shop_id empty) were treated as having no shop, so the Kibali
-- module, pages and functions were invisible to them.
-- Safe to run more than once.

create or replace function public.kibali_my_shop()
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select shop_id from public.app_users where id = auth.uid()),
    (select shop_id from public.shop_owners where user_id = auth.uid() limit 1)
  )
$$;
