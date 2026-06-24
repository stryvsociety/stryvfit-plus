# SSF-42 Progress

Date: 2026-06-24

## Scope Completed

- Added a client Account tab and `/account` page for profile, billing, email/password, and upcoming session management.
- Kept Clerk responsible for signed-in email and password management through the Clerk user profile modal.
- Added app-owned profile fields for client goal and emergency contact details.
- Added client-side cancellation access with a one-time courtesy late cancellation inside 24 hours; later late cancellations are blocked.
- Added admin client profile editing from the StryvAdmin side panel.
- Added admin manual scheduling from the appointment timeline. The action creates a StryvFit booking row and requires a Google Calendar event before the appointment is kept.
- Changed admin booking update/cancel behavior to fail closed when Google Calendar cannot be updated or deleted.
- Made recurring weekday availability removal explicitly future-only in the trainer schedule settings.

## Verification

- `bun test tests/bookings.test.ts tests/admin-surface-regressions.test.ts` passed with 24 tests.
- `bun run typecheck` passed.
- `bun test` passed with 75 tests.
- `bun run lint` passed with no ESLint warnings or errors.
- `bun run build` passed and generated `/account`, `/api/admin/bookings`, `/api/admin/clients/[id]`, `/api/client/profile`, and `/api/client/bookings/[id]`.
- `bun run supabase:push -- --dry-run` showed one pending migration: `20260624130000_ssf42_account_policy.sql`.
- `bun run supabase:push -- --yes` applied `20260624130000_ssf42_account_policy.sql` to the linked remote database.
- `bun run cf:deploy` deployed worker version `2d55752b-e065-4584-a6bb-b83c820ec543` to `app.stryvsocietyfit.com` and related routes.
- Production checks:
  - `https://app.stryvsocietyfit.com/account` returns `307` to `/sign-in` while signed out.
  - `https://app.stryvsocietyfit.com/api/client/profile` returns Clerk `401` while signed out.
  - `POST https://app.stryvsocietyfit.com/api/admin/bookings` returns Clerk `401` while signed out.
  - `https://app.stryvsocietyfit.com/sign-in` server HTML includes `Sign in to your StryvFit account`.
- Browser checks:
  - Local `/sign-in` rendered the account-focused copy, both CTAs, and the exact bug-zap notice at desktop and 390px mobile widths.
  - Local `/account` redirected unsigned users to `/sign-in`; local `/admin/pulse` redirected unsigned users to `/sign-in-admin/sign-in`.
  - Chrome extension navigation timed out before reaching localhost, so signed-in admin/account interiors were verified by build, tests, source regression coverage, route auth checks, and deployment rather than a live signed-in Chrome session.

## Remaining Verification

- Complete final review, commit, and Linear update.
