insert into public.app_settings (
  id,
  trainer_name,
  trainer_phone,
  cancellation_policy_hours,
  meal_prep_enabled,
  doordash_partner_url
)
values (
  1,
  'Ashley',
  null,
  24,
  false,
  null
)
on conflict (id) do update
set
  trainer_name = excluded.trainer_name,
  trainer_phone = coalesce(public.app_settings.trainer_phone, excluded.trainer_phone),
  cancellation_policy_hours = excluded.cancellation_policy_hours,
  meal_prep_enabled = excluded.meal_prep_enabled,
  doordash_partner_url = coalesce(public.app_settings.doordash_partner_url, excluded.doordash_partner_url);
