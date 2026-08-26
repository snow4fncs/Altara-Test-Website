-- Records when the shipped/tracking email was last sent for an order, so the
-- fulfilment console can show "Emailed" and offer "Email again" instead of
-- guessing. Run once in the Supabase SQL editor.
alter table orders add column if not exists shipped_email_at timestamptz;

-- Backfill: every order shipped before this column existed had its email sent
-- at dispatch time (ship always notified unless unticked).
update orders set shipped_email_at = shipped_at
  where shipped_at is not null and shipped_email_at is null;
