-- Trainer booking rules (hours, buffers, blocked slots) shared across all clients.
alter table public.app_settings
  add column if not exists booking_availability jsonb not null default jsonb_build_object(
    'firstStart', '07:00',
    'lastStart', '18:00',
    'bufferMinutes', 30,
    'blockedSlots', '{}'::jsonb
  );
