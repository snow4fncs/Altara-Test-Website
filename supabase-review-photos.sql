-- Altara: photos on reviews
-- Run once in Supabase -> SQL Editor. The storage bucket is created by the app,
-- so this only adds the column.

alter table public.reviews add column if not exists photos jsonb not null default '[]'::jsonb;

select table_name, column_name from information_schema.columns
where table_schema='public' and table_name='reviews' and column_name='photos';
