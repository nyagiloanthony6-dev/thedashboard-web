-- Shop setting: show the POS tab on the shop admin's app screen (default on)
alter table public.shops add column if not exists admin_pos boolean not null default true;
notify pgrst, 'reload schema';
