create table if not exists public.admin_meal_plans (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references public.app_users(id) on delete set null,
  client_email text,
  client_name text,
  title text not null,
  summary text not null,
  workout_focus text,
  meals jsonb not null default '[]'::jsonb,
  totals jsonb not null default '{}'::jsonb,
  brief text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_record_id uuid references public.admin_publish_records(id) on delete set null,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_email text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint admin_meal_plans_client_target_check check (client_id is not null or client_email is not null)
);

create index if not exists admin_meal_plans_client_idx
  on public.admin_meal_plans (client_id, updated_at desc)
  where client_id is not null;

create index if not exists admin_meal_plans_client_email_idx
  on public.admin_meal_plans (client_email, updated_at desc)
  where client_email is not null;

create index if not exists admin_meal_plans_status_idx
  on public.admin_meal_plans (status, updated_at desc);

drop trigger if exists admin_meal_plans_touch_updated_at on public.admin_meal_plans;
create trigger admin_meal_plans_touch_updated_at
before update on public.admin_meal_plans
for each row execute function public.touch_updated_at();

alter table public.admin_meal_plans enable row level security;

grant all on public.admin_meal_plans to service_role;
