create table if not exists public.billing_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid not null references public.app_users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table if not exists public.billing_recovery_notices (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete set null,
  client_email text,
  stripe_event_id text,
  stripe_invoice_id text,
  stripe_subscription_id text,
  reason text not null,
  email_status text not null default 'skipped',
  push_status text not null default 'skipped',
  created_at timestamptz not null default now()
);

create index if not exists billing_push_subscriptions_user_idx
  on public.billing_push_subscriptions (app_user_id, last_seen_at desc);

create index if not exists billing_recovery_notices_user_idx
  on public.billing_recovery_notices (app_user_id, created_at desc);

create unique index if not exists billing_recovery_notices_event_user_idx
  on public.billing_recovery_notices (stripe_event_id, app_user_id)
  where stripe_event_id is not null and app_user_id is not null;

drop trigger if exists billing_push_subscriptions_touch_updated_at on public.billing_push_subscriptions;
create trigger billing_push_subscriptions_touch_updated_at
before update on public.billing_push_subscriptions
for each row execute function public.touch_updated_at();

alter table public.billing_push_subscriptions enable row level security;
alter table public.billing_recovery_notices enable row level security;

drop policy if exists "billing push subscriptions service only" on public.billing_push_subscriptions;
create policy "billing push subscriptions service only" on public.billing_push_subscriptions
  for all using (false) with check (false);

drop policy if exists "billing recovery notices service only" on public.billing_recovery_notices;
create policy "billing recovery notices service only" on public.billing_recovery_notices
  for all using (false) with check (false);

grant all on public.billing_push_subscriptions to service_role;
grant all on public.billing_recovery_notices to service_role;
