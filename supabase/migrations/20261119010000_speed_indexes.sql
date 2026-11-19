-- Speed: indexes for the lists the app and web load most. Safe to run more than once.
create index if not exists sales_shop_created_idx       on public.sales (shop_id, created_at desc);
create index if not exists sale_items_sale_idx          on public.sale_items (sale_id);
create index if not exists loan_payments_sale_idx       on public.loan_payments (sale_id);
create index if not exists products_shop_idx            on public.products (shop_id);
create index if not exists customers_shop_idx           on public.customers (shop_id);
create index if not exists expenses_shop_created_idx    on public.expenses (shop_id, created_at desc);
create index if not exists app_users_shop_idx           on public.app_users (shop_id);
create index if not exists product_field_values_field_idx   on public.product_field_values (field_id);
create index if not exists product_field_values_product_idx on public.product_field_values (product_id);
analyze public.sales; analyze public.sale_items; analyze public.products;
