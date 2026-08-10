-- Altara reviews table
-- Run once in Supabase -> SQL Editor -> New query -> paste -> Run

create table if not exists public.reviews (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz not null default now(),
  product       text not null check (product in ('midnight-black', 'contrast-white')),
  email         text not null,
  reviewer_name text not null default 'Altara customer',
  rating        int  not null check (rating between 1 and 5),
  title         text,
  body          text not null,
  verified      boolean not null default false,
  approved      boolean not null default false
);

-- one review per customer per product
create unique index if not exists reviews_email_product_idx
  on public.reviews (email, product);

-- fast lookup of what actually shows on the product page
create index if not exists reviews_public_idx
  on public.reviews (product, approved, created_at desc);

-- Lock the table down. The site talks to it only through /api/reviews using the
-- service key, which bypasses RLS. With RLS on and no policies, nothing can read
-- or write via the public anon key - so emails can never leak to the browser.
alter table public.reviews enable row level security;


-- ─────────────────────────────────────────────────────────────
-- Approving reviews (nothing appears on the site until you do)
-- ─────────────────────────────────────────────────────────────

-- see what is waiting
--   select created_at, product, reviewer_name, rating, title, body
--   from reviews where approved = false order by created_at desc;

-- publish one
--   update reviews set approved = true where id = 'paste-the-id-here';

-- publish everything pending
--   update reviews set approved = true where approved = false;
