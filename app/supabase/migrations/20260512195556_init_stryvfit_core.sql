-- StryvFit+ core Supabase schema.
-- Supports the PWA/member shell, trainer settings, Cal webhook persistence,
-- realtime trainer notes, and future meal orders.

create extension if not exists pgcrypto with schema extensions;
create schema if not exists private;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text unique not null,
  full_name text,
  phone text,
  tier text not null default 'free' check (tier in ('free','coaching','premium')),
  stripe_customer_id text,
  stripe_subscription_id text,
  subscription_status text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.app_settings (
  id int primary key default 1,
  trainer_phone text,
  trainer_name text not null default 'Ashley',
  cancellation_policy_hours int not null default 24,
  meal_prep_enabled boolean not null default false,
  doordash_partner_url text,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

insert into public.app_settings (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.cal_bookings (
  cal_booking_id text primary key,
  user_id uuid references public.profiles(id) on delete set null,
  cal_event_type text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','rescheduled','completed')),
  meeting_url text,
  notes text,
  client_email text,
  client_name text,
  raw jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.trainer_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  author_id uuid references public.profiles(id) on delete set null,
  body text not null,
  attachments jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  items jsonb not null,
  subtotal_cents int not null,
  stripe_session_id text,
  status text not null default 'pending' check (status in ('pending','paid','fulfilled','cancelled')),
  created_at timestamptz not null default now()
);

create index if not exists profiles_email_idx on public.profiles (email);
create index if not exists profiles_admin_idx on public.profiles (is_admin) where is_admin;
create index if not exists cal_bookings_user_idx on public.cal_bookings (user_id);
create index if not exists cal_bookings_starts_idx on public.cal_bookings (starts_at);
create index if not exists cal_bookings_client_email_idx on public.cal_bookings (client_email);
create index if not exists trainer_notes_user_idx on public.trainer_notes (user_id, created_at desc);
create index if not exists trainer_notes_pinned_idx on public.trainer_notes (user_id, pinned, created_at desc);
create index if not exists meal_orders_user_idx on public.meal_orders (user_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, email, full_name, phone)
  values (
    new.id,
    coalesce(new.email, new.phone, new.id::text),
    new.raw_user_meta_data ->> 'full_name',
    new.phone
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

drop trigger if exists app_settings_touch_updated_at on public.app_settings;
create trigger app_settings_touch_updated_at
before update on public.app_settings
for each row execute function public.touch_updated_at();

drop trigger if exists cal_bookings_touch_updated_at on public.cal_bookings;
create trigger cal_bookings_touch_updated_at
before update on public.cal_bookings
for each row execute function public.touch_updated_at();

drop trigger if exists trainer_notes_touch_updated_at on public.trainer_notes;
create trigger trainer_notes_touch_updated_at
before update on public.trainer_notes
for each row execute function public.touch_updated_at();

alter table public.profiles enable row level security;
alter table public.cal_bookings enable row level security;
alter table public.trainer_notes enable row level security;
alter table public.meal_orders enable row level security;
alter table public.app_settings enable row level security;

drop policy if exists "profiles self read" on public.profiles;
create policy "profiles self read" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles self update" on public.profiles;
create policy "profiles self update" on public.profiles
  for update using (auth.uid() = id)
  with check (auth.uid() = id);

drop policy if exists "profiles self insert" on public.profiles;
create policy "profiles self insert" on public.profiles
  for insert with check (auth.uid() = id);

drop policy if exists "bookings self read" on public.cal_bookings;
create policy "bookings self read" on public.cal_bookings
  for select using (user_id = auth.uid());

drop policy if exists "notes self read" on public.trainer_notes;
create policy "notes self read" on public.trainer_notes
  for select using (user_id = auth.uid());

drop policy if exists "notes admin insert" on public.trainer_notes;
create policy "notes admin insert" on public.trainer_notes
  for insert with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
    )
  );

drop policy if exists "notes admin update" on public.trainer_notes;
create policy "notes admin update" on public.trainer_notes
  for update using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
    )
  );

drop policy if exists "meal orders self read" on public.meal_orders;
create policy "meal orders self read" on public.meal_orders
  for select using (user_id = auth.uid());

drop policy if exists "meal orders self insert" on public.meal_orders;
create policy "meal orders self insert" on public.meal_orders
  for insert with check (user_id = auth.uid());

drop policy if exists "settings public read" on public.app_settings;
create policy "settings public read" on public.app_settings
  for select using (true);

drop policy if exists "settings admin update" on public.app_settings;
create policy "settings admin update" on public.app_settings
  for update using (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
    )
  )
  with check (
    exists (
      select 1
      from public.profiles p
      where p.id = auth.uid()
        and p.is_admin = true
    )
  );

grant usage on schema public to anon, authenticated, service_role;
grant select on public.app_settings to anon, authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.cal_bookings to authenticated;
grant select, insert, update on public.trainer_notes to authenticated;
grant select, insert on public.meal_orders to authenticated;
grant all on all tables in schema public to service_role;

do $$
begin
  alter publication supabase_realtime add table public.trainer_notes;
exception
  when duplicate_object then null;
  when undefined_object then null;
end;
$$;
