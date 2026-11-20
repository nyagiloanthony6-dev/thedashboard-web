-- Shop tagline shown under the shop name on invoices (set in app Settings → Shop settings)
alter table public.shops add column if not exists tagline text;
-- Keep G2K's current line until they change it
update public.shops set tagline = 'Chemical & Rubber Specialist' where tagline is null and name ilike 'g2k%';
notify pgrst, 'reload schema';
