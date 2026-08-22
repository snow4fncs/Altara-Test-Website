-- Altara fulfilment + lifecycle email columns
-- Run once in Supabase -> SQL Editor -> New query -> paste -> Run

alter table public.orders add column if not exists tracking_number text;
alter table public.orders add column if not exists carrier          text default 'Australia Post';
alter table public.orders add column if not exists shipped_at       timestamptz;
alter table public.orders add column if not exists review_email_at  timestamptz;
alter table public.orders add column if not exists repeat_email_at  timestamptz;

-- Fast lookup of what still needs shipping, and what is due a review nudge.
create index if not exists orders_unshipped_idx on public.orders (shipped_at) where shipped_at is null;
create index if not exists orders_shipped_idx   on public.orders (shipped_at desc);

-- Abandoned checkouts we have emailed, so Stripe retries never double-send.
create table if not exists public.abandoned_carts (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  stripe_session_id  text not null unique,
  email              text not null,
  recovery_url       text,
  amount             numeric,
  currency           text,
  emailed_at         timestamptz
);
alter table public.abandoned_carts enable row level security;

-- Confirm it worked: should list abandoned_carts, orders, reviews, waitlist
select table_name from information_schema.tables
where table_schema = 'public' order by table_name;
