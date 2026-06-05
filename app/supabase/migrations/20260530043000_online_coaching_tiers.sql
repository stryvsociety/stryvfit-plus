update public.bookings
set service_type = 'online_coaching_starter',
    updated_at = now()
where service_type = 'online_coaching';

alter table public.bookings
  drop constraint if exists bookings_service_type_check;

alter table public.bookings
  add constraint bookings_service_type_check check (
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
  );
