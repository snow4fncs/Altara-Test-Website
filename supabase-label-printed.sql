-- Tracks which orders have been exported to MyPost (postage bought/label
-- printed) so the CSV export never includes them twice. Run once in the
-- Supabase SQL editor.
alter table orders add column if not exists label_printed_at timestamptz;

-- Backfill: these three orders already had labels bought on 2 Sep 2026
-- (Wayne Siow, Adam Barnes, Brandon Cox) - keep them out of future exports.
update orders set label_printed_at = now()
  where shipped_at is null
    and upper(right(stripe_payment_intent, 8)) in ('0QGLNTWC','0L3HHKWR','0YJ6ZI2D');
