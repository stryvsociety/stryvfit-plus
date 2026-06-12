create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  app_user_id uuid references public.app_users(id) on delete set null,
  client_email text,
  client_name text,
  title text not null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_record_id uuid references public.admin_publish_records(id) on delete set null,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_email text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_notes_client_target_check check (app_user_id is not null or client_email is not null)
);

create index if not exists client_notes_user_idx
  on public.client_notes (app_user_id, pinned desc, updated_at desc)
  where app_user_id is not null;

create index if not exists client_notes_email_idx
  on public.client_notes (client_email, pinned desc, updated_at desc)
  where client_email is not null;

create index if not exists client_notes_status_idx
  on public.client_notes (status, updated_at desc);

drop trigger if exists client_notes_touch_updated_at on public.client_notes;
create trigger client_notes_touch_updated_at
before update on public.client_notes
for each row execute function public.touch_updated_at();

alter table public.client_notes enable row level security;

grant all on public.client_notes to service_role;
