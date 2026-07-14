alter table public.bookings
  add column if not exists stripe_invoice_id text;

create unique index if not exists bookings_stripe_invoice_idx
  on public.bookings (stripe_invoice_id)
  where stripe_invoice_id is not null;
