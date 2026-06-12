create table if not exists public.admin_publish_records (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.app_users(id) on delete set null,
  client_email text,
  client_name text,
  surface text not null check (surface in ('workout_plan', 'meal_plan', 'appointment_plan', 'client_note')),
  title text not null,
  summary text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'published' check (status in ('draft', 'published')),
  published_by_user_id uuid references public.app_users(id) on delete set null,
  published_by_email text,
  published_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_publish_records_client_target_check check (client_id is not null or client_email is not null)
);

create index if not exists admin_publish_records_client_idx
  on public.admin_publish_records (client_id, published_at desc)
  where client_id is not null;

create index if not exists admin_publish_records_client_email_idx
  on public.admin_publish_records (client_email, published_at desc)
  where client_email is not null;

create index if not exists admin_publish_records_surface_idx
  on public.admin_publish_records (surface, published_at desc);

drop trigger if exists admin_publish_records_touch_updated_at on public.admin_publish_records;
create trigger admin_publish_records_touch_updated_at
before update on public.admin_publish_records
for each row execute function public.touch_updated_at();

alter table public.admin_publish_records enable row level security;

grant all on public.admin_publish_records to service_role;
