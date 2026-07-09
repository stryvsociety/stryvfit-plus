# SSF First Session Booking Flow Progress

Date: 2026-07-03
Branch: codex/ssf-guided-booking-flow

## Goal

Replace the old first-session booking form with a production-grade full-screen guided flow:

1. Basic Info
2. Choose Date
3. Choose Time
4. Choose Package
5. Payment and Billing Info via Stripe
6. Completion confirmation sent by the user's preferred communication channel

## Research Lock

Outcome: Make booking feel like a guided iOS setup flow that still respects checkout usability and does not change the Stryv color or font palette.

Question: What onboarding and checkout architecture should guide the redesign?

Decision unlocked: Build a linear, full-screen, single-decision-per-step flow with an always-visible progress path, explicit CTA copy, previous-step summaries, and a real browser redirect to the Stripe Checkout URL returned by the server.

Source ledger:

- Apple HIG Onboarding: supports simple, interactive onboarding that helps users act safely before committing.
- Apple HIG Layout: supports progressive disclosure for complex content.
- Baymard checkout guidance: supports a literal step path, safe backward navigation, reduced visible form effort, and explicit third-party payment CTAs.
- Stripe Checkout quickstart and changelog: supports server-created Checkout Sessions and redirecting users with the session URL using standard browser redirect functions.
- Resend Send Email API: supports a simple server-side completion email through `POST /emails`; repo already has a Resend fetch pattern in `src/lib/billingNotifications.ts`.

## Implementation Notes

- Existing dirty files contained the previous paid-checkout return safety work. Keep it and build on it.
- Bookings already have `metadata jsonb`; use metadata for communication preference rather than adding a migration unless tests prove otherwise.
- Do not replace the global palette or fonts.
- Keep Stripe handoff explicit: the CTA must call the booking API, receive `checkoutUrl`, and open it with a real navigation.

## Validation Log

- Passed: `bun test tests/admin-surface-regressions.test.ts tests/bookings.test.ts` - 26 tests, 0 failures.
- Passed: final `bun test` - 77 tests, 0 failures.
- Passed: final `git diff --check`.
- Passed: final `bun run build`.
- Passed: final sequential `bun run typecheck`.
- Browser proof:
  - Real local `/book?service=free&intent=first-session` redirected signed-out users to `/sign-in/sign-in?redirect_url=...`, preserving the protected booking route.
  - Controlled Playwright harness rendered the actual `FirstSessionBookingFlow` component at desktop and 390px mobile widths.
  - Harness completed Basic Info -> Choose Date -> Choose Time -> Choose Package -> Payment & Billing.
  - Harness selected text communication, submitted E.164 phone `+13055550198`, chose `sessions_4`, accepted terms, and clicked `Agree & Open Stripe`.
  - Mocked checkout API received `serviceType: sessions_4`, `communicationPreference: text`, `consentAcknowledged: true`, and the expected 60-minute booking window.
- Browser navigated to mocked `https://checkout.stripe.com/c/pay/...`, proving the CTA performs a real navigation from the returned checkout URL.
- Final review fixes:
  - Removed the temporary browser harness route before validation and commit.
  - Adjusted Stripe return completion so it does not invent date/time details after a hosted Checkout return.
  - Tagged Stripe success and cancel URLs with `intent=first-session`.
  - Tightened first-session gating so abandoned paid Stripe holds do not count as completed first-session history.
  - Added a text-webhook idempotency key for provider-side dedupe.
- Final review pass complete.

## Maintenance Recheck - 2026-07-09

- SSF-001 open Linear issues remained `SSF-46`, `SSF-45`, and `SSF-44`; no newer open SSFitness bug superseded the current branch work.
- Current branch stayed `codex/ssf-guided-booking-flow` at app fix commit `4b7d112`.
- Required notice stayed visible with exact copy: `yesterday's bugs have been zapped`.
- Passed: `bun test tests/client-asset-recovery.test.ts tests/admin-surface-regressions.test.ts tests/bookings.test.ts`.
- Passed: `bun test`.
- Passed: `bun run typecheck`.
- Passed: `bun run lint`.
- Passed: `bun run build`.
- Passed: `git diff --check`.
- Browser proof used the Codex in-app browser against `http://127.0.0.1:3001/sandbox/first-session-booking` after `localhost` returned an in-app browser HTTP failure while direct curl returned 200.
- Desktop viewport `1280x720`: progressed Basic Info -> Choose Date -> Choose Time -> Choose Package -> Payment & Billing, clicked `Confirm Free Session` without accepting terms, and saw `Agree to the booking terms before continuing.` with no booking submission.
- Mobile viewport `390x844`: first booking screen rendered with no framework overlay, no horizontal overflow, clean browser console logs, and the required bottom-left notice.
- Production Clerk proxy recheck for `SSF-45`: `/__clerk/v1/environment` returned HTTP 200, and synthetic `sess_probe/touch` returned the expected HTTP 401 `signed_out` response.
- Vercel beta deployment remained blocked: no `.vercel/project.json`, no Vercel token/org/project/beta URL values in `app/.env.local`, and the only visible SSFitness Vercel project, `ssfitness-www-app-redirect`, inspected as an `api/redirect` shim to `https://app.stryvsocietyfit.com/` rather than an app beta target.
