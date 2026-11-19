-- Owner chooses which staff can stand guarantor for loan sales (default: everyone).
-- Run after 20261118000000_loan_waiver_guarantor.sql.
alter table public.app_users add column if not exists can_guarantee boolean not null default true;
notify pgrst, 'reload schema';
