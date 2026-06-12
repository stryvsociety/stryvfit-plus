create table if not exists public.client_requests (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete set null,
  client_email text,
  client_name text,
  kind text not null check (kind in ('trainer-note', 'meal-plan-change')),
  message text not null,
  suggested_actions jsonb not null default '[]'::jsonb,
  meals jsonb not null default '[]'::jsonb,
  status text not null default 'new' check (status in ('new', 'reviewed', 'archived')),
  reviewed_by_user_id uuid references public.app_users(id) on delete set null,
  reviewed_by_email text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_requests_client_target_check check (app_user_id is not null or client_email is not null)
);

create index if not exists client_requests_user_idx
  on public.client_requests (app_user_id, created_at desc)
  where app_user_id is not null;

create index if not exists client_requests_email_idx
  on public.client_requests (client_email, created_at desc)
  where client_email is not null;

create index if not exists client_requests_status_idx
  on public.client_requests (status, created_at desc);

drop trigger if exists client_requests_touch_updated_at on public.client_requests;
create trigger client_requests_touch_updated_at
before update on public.client_requests
for each row execute function public.touch_updated_at();

alter table public.client_requests enable row level security;

grant all on public.client_requests to service_role;
