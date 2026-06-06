alter table public.app_users
  add column if not exists phone text;

alter table public.bookings
  add column if not exists client_phone text;

create index if not exists app_users_phone_idx on public.app_users (phone)
  where phone is not null;
