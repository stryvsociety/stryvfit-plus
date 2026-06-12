create table if not exists public.admin_workout_routines (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.app_users(id) on delete set null,
  client_email text,
  client_name text,
  title text not null,
  summary text not null,
  blocks jsonb not null default '[]'::jsonb,
  selected_exercises jsonb not null default '[]'::jsonb,
  training_week jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_record_id uuid references public.admin_publish_records(id) on delete set null,
  wger_sync_requested boolean not null default false,
  wger_sync_status text not null default 'not_configured' check (
    wger_sync_status in ('not_requested', 'not_configured', 'pending', 'synced', 'failed')
  ),
  wger_routine_id text,
  wger_sync_error text,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_workout_routines_client_target_check check (client_id is not null or client_email is not null)
);

create index if not exists admin_workout_routines_client_idx
  on public.admin_workout_routines (client_id, updated_at desc)
  where client_id is not null;

create index if not exists admin_workout_routines_client_email_idx
  on public.admin_workout_routines (client_email, updated_at desc)
  where client_email is not null;

create index if not exists admin_workout_routines_status_idx
  on public.admin_workout_routines (status, updated_at desc);

drop trigger if exists admin_workout_routines_touch_updated_at on public.admin_workout_routines;
create trigger admin_workout_routines_touch_updated_at
before update on public.admin_workout_routines
for each row execute function public.touch_updated_at();

alter table public.admin_workout_routines enable row level security;

grant all on public.admin_workout_routines to service_role;
