# SSF First Session Booking Flow Progress

## Mobile Membership Invoice Handoff - 2026-07-14

- Wrote `sprint-md/S3-BRIEF-mobile-membership-invoice-handoff.md` as the execution source of truth for the reported Safari booking error, the clipped signed-in duration control, removal of ineligible payment methods, and the mobile membership-invoice handoff.
- Confirmed the customer-facing invoice will use a manually finalized one-off Stripe invoice with automatic advancement disabled, so the returned Hosted Invoice Page is payable without creating a subscription that appears active before payment.
- Recorded the Linear Awaiting Review audit as blocked by an expired connector token; no Linear state has been changed or assumed.
- Expanded scope on 2026-07-14: meal prep is removed from reachable client/admin navigation and workflow routes, while its implementation remains in the repository for later integration.

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

## Maintenance Recheck - 2026-07-11

- Thread rename was unavailable, so the run report uses the required first-line fallback `SSF-001 2026-07-11 (America/New_York)`.
- Open Linear issues remained `SSF-46`, `SSF-45`, and `SSF-44`; all were last updated during the prior maintenance run on 2026-07-09. Today's recheck comments were added without changing their states.
- No new safe application fix surfaced. The stale Next.js CSS recovery, checkout feedback, and exact bottom-left `yesterday's bugs have been zapped` notice remain present; no unrelated user changes were touched.
- Verification passed: `bun test` (79 tests), `bun run typecheck`, `bun run lint`, `bun run build`, and `git diff --check`. Typecheck was run after the build settled to avoid the known generated `.next/types` race.
- Codex in-app browser proof used the local production build at `http://127.0.0.1:3001/sandbox/first-session-booking`: at `1280x720`, required-name validation, date/time/package progression, consent validation, and free-session confirmation reached `/sandbox/first-session-booking?booking=confirmed`; at `390x844`, the first screen fit without horizontal overflow and retained the exact notice at bottom-left.
- Rendered confirmation evidence showed no obstructive overlay or clipped controls. The local browser logged only the known Clerk production-key origin mismatch caused by using localhost with the production Clerk proxy; production `/__clerk/v1/environment` and the unsigned session probe still returned the expected 200 and 401 `signed_out` responses.
- Beta deployment was not attempted because no application code changed and the only visible Vercel project, `ssfitness-www-app-redirect`, is an `api/redirect` shim rather than an SSFitness app beta target. The branch remains pushed at the existing maintenance commit, and this run is not eligible for `App Updated.`
- Cleanup passed: the local production server was stopped, the in-app browser session was closed, and no run-owned preview/browser process remained.

## Maintenance Recheck - 2026-07-13

- Thread rename was attempted with `SSF-001 2026-07-13`; the rename handler did not return, so the run report uses the required first-line fallback. `$CODEX_HOME` was unset; the automation memory path used was `/Users/tifos/.codex/automations/SSF-001-daily-linear-bug-zapper/memory.md`.
- Shared Solvys `Design.md`, the SSFitness source, and the existing progress history were read before the audit. No repo-local `Design.md`/`DESIGN.md` exists. No frontend code changed; design impact was limited to preserving the existing small bottom-left zap notice and the current booking surface.
- Live Linear query used `SSFITNESS_LINEAR_API_KEY` from `app/.env.local` without printing it. Open actionable issues remain `SSF-46` stale CSS/member sign-in, `SSF-45` landing-page Clerk sign-in, and `SSF-44` payment/booking feedback. None was created or updated after the prior run timestamp `2026-07-13T03:01:07.715Z`, so no new safe fix was applied.
- The required notice remains in `app/src/components/pwa/PWAClient.tsx` with exact rendered copy `yesterday's bugs have been zapped`, fixed bottom-left placement, safe-area bottom offset, and 18px rounding. Focused regression coverage passed: 28 tests and 122 assertions. Full verification passed: `bun test` (79 tests, 251 assertions), `bun run typecheck`, `bun run lint`, `bun run build`, and `git diff --check`.
- Codex in-app browser proof used the local production build at `http://127.0.0.1:3001/sandbox/first-session-booking`. Desktop `1280x720` exercised text-confirmation validation without a phone, date refresh to Wednesday, July 15, available-time selection at 10:30 AM, paid package selection, the terms guard, and the Stripe handoff state. The sandbox checkout response returned a `localhost` URL while the browser was on `127.0.0.1`, so the browser blocked that host switch; direct navigation to the returned target on `127.0.0.1` rendered `Payment link opened` and `Mock checkout session ready`. This is a local sandbox host mismatch, not a production checkout failure.
- The same desktop run completed the free-session path through the real sandbox POST and reached `http://127.0.0.1:3001/sandbox/first-session-booking?booking=confirmed` with `You are booked. Your email confirmation is on the way.` The rendered completion state retained the exact zap notice and showed the selected session/date/time.
- Mobile `390x844` rendered the first booking screen with no horizontal overflow (`scrollWidth=379`, `innerWidth=390`), no clipped controls or framework overlay, and the notice at `left=12px`, `bottom=16px`; after a real scroll, the notice remained fixed at the same offsets. Screenshots were inspected for spacing, contrast, alignment, text overflow, and overlay obstruction.
- Browser console output contained only the known localhost/production-Clerk origin mismatch. Production Clerk probes remained healthy: `https://stryvsocietyfit.com/__clerk/v1/environment` returned HTTP 200 and the unsigned session touch returned HTTP 401 `signed_out`.
- No beta deployment was attempted because no application code changed. Current Vercel project listing contains no SSFitness app target, `app/.vercel/project.json` is absent, and `vercel inspect ssfitness-www-app-redirect` cannot find that project under the authenticated `solvys` context. The branch remains pushed at `beab463934aa76bc66a3550d10008a81458b3969`, with only the pre-existing untracked `.cursor/` outside this evidence note. This run is not eligible for `App Updated.`
- Cleanup passed: the local Next server was stopped, the in-app browser tab was finalized with no kept tabs, and port 3001 has no listener or run-owned preview process.

## Mobile Membership Invoice Handoff - 2026-07-14

- Replaced the cross-origin booking history write with a same-origin path conversion, so a public-host booking confirmation cannot attempt to mutate history to `app.stryvsocietyfit.com`.
- Removed Cash App Pay and PayPal from customer-facing configuration and Stripe setup/audit expectations. Membership billing now accepts only Stripe-hosted card invoices for the coach-confirmed in-person packages.
- Added the authenticated free-session gate and idempotent hosted-invoice route. Repeated taps reopen the same package invoice; a different pending package is rejected to prevent duplicate charges.
- Removed meal prep from reachable client/admin navigation, phase transitions, and route handoffs while retaining its implementation code for later integration.
- Retired the three meal-prep API entry points behind 404 responses and removed `meal_prep` from active booking parsing and admin service pickers, so a crafted URL or request cannot revive the removed feature.
- Removed the legacy calendar event binding and homepage nutrition/meal card. The active booking catalog no longer ships the deferred service object, while historical rows render as an archived session instead of failing.
- Local browser E2E reached the sandbox confirmation state and its membership-billing handoff. The browser backend's 320px capture is a scaled 1280px CSS viewport, so final mobile breakpoint proof must happen after deployment on the live target.
- Final local checks passed: `bun test` (81 tests), `bun run typecheck`, `bun run lint`, `bun run build`, and `git diff --check`. During the build review, a client import of a server-only booking module was found and corrected before this record.
- Live production review found that the broad `/api/admin(.*)` Clerk guard returned `401` before the retired admin meal handler could return `404`. Middleware now short-circuits every retired meal endpoint to the same `404` response before auth, so those legacy interfaces are consistently unavailable to all callers.
- Live Stripe review found Cash App Pay and PayPal still set to `on` despite Stripe marking both unavailable. The default payment-method configuration now has both preferences set to `off`; the read-only Stripe audit fails if either is enabled again.
- The final surface review also removed `meal-plan-change` from the active client-request API and hides legacy meal requests from reads, so a crafted authenticated request cannot recreate a meal-prep workflow. Operator, onboarding, redeploy, and control docs now describe the feature as archived rather than live.
- Final invoice review hardened the recovery path for a partial Stripe failure: a retained draft is reloaded, receives the intended one-time price only when it is empty, and is rejected rather than finalized if it cannot become payable. The recovery item uses an invoice-specific idempotency key.
- The dedicated dependency audit initially found high-severity deployment-tool transitive vulnerabilities. OpenNext Cloudflare, Wrangler, and ESLint were updated and the supported `form-data` fix was pinned; the final `bun audit` reports no vulnerabilities.
- Invoice retry review found that an interrupted Stripe line-item creation could leave a tagged $0 draft outside the prior pending-invoice filter. Drafts are now always recoverable before a new invoice can be created, with deterministic Stripe-mocked coverage for creation, recovery, card-only settings, and the free-session gate. The final local gate passed: 83 tests / 282 assertions, typecheck, lint, production build, audit, and whitespace diff check.
