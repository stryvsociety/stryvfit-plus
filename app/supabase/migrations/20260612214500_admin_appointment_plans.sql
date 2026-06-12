create table if not exists public.admin_appointment_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.app_users(id) on delete set null,
  client_email text,
  client_name text,
  booking_id uuid references public.bookings(id) on delete set null,
  appointment_ref text,
  title text not null,
  summary text not null,
  scheduled_at timestamptz,
  duration_minutes integer check (duration_minutes is null or (duration_minutes > 0 and duration_minutes <= 480)),
  location text,
  preparation jsonb not null default '[]'::jsonb,
  follow_up jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_record_id uuid references public.admin_publish_records(id) on delete set null,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_email text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_appointment_plans_client_target_check check (client_id is not null or client_email is not null)
);

create index if not exists admin_appointment_plans_client_idx
  on public.admin_appointment_plans (client_id, updated_at desc)
  where client_id is not null;

create index if not exists admin_appointment_plans_client_email_idx
  on public.admin_appointment_plans (client_email, updated_at desc)
  where client_email is not null;

create index if not exists admin_appointment_plans_status_idx
  on public.admin_appointment_plans (status, updated_at desc);

create index if not exists admin_appointment_plans_scheduled_at_idx
  on public.admin_appointment_plans (scheduled_at)
  where scheduled_at is not null;

drop trigger if exists admin_appointment_plans_touch_updated_at on public.admin_appointment_plans;
create trigger admin_appointment_plans_touch_updated_at
before update on public.admin_appointment_plans
for each row execute function public.touch_updated_at();

alter table public.admin_appointment_plans enable row level security;

grant all on public.admin_appointment_plans to service_role;
