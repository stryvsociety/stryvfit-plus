create table if not exists public.app_users (
  id uuid primary key default gen_random_uuid(),
  clerk_user_id text unique not null,
  email text unique not null,
  full_name text,
  role text not null default 'client' check (role in ('client','trainer','admin','support')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bookings (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete set null,
  clerk_user_id text references public.app_users(clerk_user_id) on delete set null,
  service_type text not null default 'free' check (
    service_type in (
      'free',
      'sessions_4',
      'sessions_8',
      'sessions_12',
      'online_coaching_starter',
      'online_coaching_elevate',
      'online_coaching_elite',
      'meal_prep'
    )
  ),
  status text not null default 'held' check (
    status in ('held','pending_payment','confirmed','cancelled','rescheduled','completed','no_show','expired')
  ),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes int not null check (duration_minutes in (30, 45, 60, 90, 120)),
  timezone text not null default 'America/New_York',
  client_email text,
  client_name text,
  stripe_checkout_session_id text unique,
  stripe_payment_intent_id text,
  stripe_subscription_id text,
  stripe_customer_id text,
  google_event_id text,
  google_calendar_id text,
  hold_expires_at timestamptz,
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stripe_webhook_events (
  id text primary key,
  type text not null,
  processed_at timestamptz not null default now(),
  payload jsonb not null default '{}'::jsonb
);

create index if not exists app_users_clerk_user_idx on public.app_users (clerk_user_id);
create index if not exists app_users_email_idx on public.app_users (email);
create index if not exists bookings_user_idx on public.bookings (app_user_id, starts_at desc);
create index if not exists bookings_clerk_user_idx on public.bookings (clerk_user_id, starts_at desc);
create index if not exists bookings_slot_idx on public.bookings (starts_at, ends_at, status);
create index if not exists bookings_stripe_session_idx on public.bookings (stripe_checkout_session_id)
  where stripe_checkout_session_id is not null;
create index if not exists bookings_google_event_idx on public.bookings (google_event_id)
  where google_event_id is not null;

drop trigger if exists app_users_touch_updated_at on public.app_users;
create trigger app_users_touch_updated_at
before update on public.app_users
for each row execute function public.touch_updated_at();

drop trigger if exists bookings_touch_updated_at on public.bookings;
create trigger bookings_touch_updated_at
before update on public.bookings
for each row execute function public.touch_updated_at();

alter table public.app_users enable row level security;
alter table public.bookings enable row level security;
alter table public.stripe_webhook_events enable row level security;

drop policy if exists "app users self read" on public.app_users;
create policy "app users self read" on public.app_users
  for select using (false);

drop policy if exists "bookings self read" on public.bookings;
create policy "bookings self read" on public.bookings
  for select using (false);

grant all on public.app_users to service_role;
grant all on public.bookings to service_role;
grant all on public.stripe_webhook_events to service_role;
