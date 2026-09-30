-- Altara stock take. Run once in Supabase -> SQL Editor -> New query -> paste -> Run.
-- Stock on hand is never stored directly: it is (received + adjustments) minus
-- covers sold, where covers sold is computed live from paid orders
-- (Twin Set = 2 covers, Full Car = 4, single = 1). So the number can never
-- drift from the orders table. Enter an opening count as a 'received' row.
create table if not exists public.stock_movements (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  sku         text not null check (sku in ('midnight-black','contrast-white')),
  kind        text not null check (kind in ('received','incoming','adjust')),
  qty         int  not null,                 -- covers (units), negative allowed for 'adjust'
  note        text,
  expected_at date,                          -- for 'incoming': when the order should land
  received_at timestamptz                    -- set when an 'incoming' row is marked received
);
create index if not exists stock_movements_sku_idx on public.stock_movements (sku, created_at desc);
