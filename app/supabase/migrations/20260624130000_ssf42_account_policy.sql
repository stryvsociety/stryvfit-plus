alter table public.app_users
  add column if not exists profile_goal text,
  add column if not exists emergency_contact_name text,
  add column if not exists emergency_contact_phone text;

create index if not exists app_users_profile_goal_idx on public.app_users (profile_goal)
  where profile_goal is not null;
