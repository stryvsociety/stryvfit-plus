# SSFitness ChatGPT Handoff

Primary entrypoint for a future ChatGPT/Codex session working on Stryv Society Fitness.

## First Response Protocol

When TP says: "Good Afternoon Chat, this is TP, your FDE. We're about to begin onboarding, please set everything up", respond as the SSFitness onboarding agent.

1. Confirm the repo root is `/Users/tifos/Desktop/SSFitness`.
2. Read this file, `app/README.md`, `infra/wger/README.md`, `app/.env.example`, and the relevant route/component files before changing anything.
3. Inspect environment health before guessing: check app envs, dev server status, `/api/incidents`, `/api/wger/exercises`, and current admin routes.
4. Explain what is ready, what is simulated, and what needs credentials or cloud provisioning.
5. Guide the operator in plain language, then use browser automation or terminal commands only when the target is clear.

Do not invent client records, subscription state, workout data, meal selections, or support status. Use visible UI state, Supabase-backed data, wger responses, or ask TP.

## Current Product Shape

SSFitness is a Next.js PWA for Stryv Society Fitness. It has two main experiences:

- Client-facing phase flow: `/book`
- Admin/trainer operating surfaces: `/admin/pulse`, `/admin/workouts`, `/admin/settings`

The client app is intended to feel full-screen and phase-by-phase. When no training session is scheduled, the user sees the calendar only. Meal prep and journaling are accessed from the floating bottom-right hamburger menu. When a remote session is scheduled, the workout appears after a countdown. After workout completion, the user swipes right or down, or taps continue, and the app briefly deliberates before choosing the next phase.

The admin app is a non-technical trainer studio. It lets the Stryv team manage appointments, meal plans, workout routines, client readiness, support requests, and wger-backed exercise choices.

## Current State Snapshot

- `app/src/components/client/ClientPhaseFlow.tsx`: client full-screen phase flow, URL-driven session/payment demos, theme toggle, floating menu, workout, meal prep, journal, payment modal.
- `app/src/components/admin/TrainerOpsStudio.tsx`: appointment and meal command center for StryvAdmin.
- `app/src/components/admin/AdminWorkoutsPage.tsx`: workout builder, client selector, wger exercise library, training week, remote video notes, support chat, schedule timeline.
- `app/src/components/admin/AdminSupportChat.tsx`: admin support request form that posts incidents into the Solvys support pipeline.
- `app/src/lib/wger.ts`: server-side wger exercise normalizer and fallback exercise set.
- `infra/wger`: self-hosted wger cloud stack with Caddy, nginx, web, Postgres, Redis, Celery worker, Celery beat, env templates, and backup script.

## Routes

- `/`: public landing page.
- `/book`: client app phase flow. Query helpers currently include `?session=remote`, `?session=in-person`, and `?pastDueDays=7`.
- `/meals`: standalone Ideal Nutrition meal prep picker.
- `/notes`: client trainer notes page. Backend read/write routes exist; the visible page still needs a frontend wiring pass.
- `/coach`: iMessage CTA to the configured trainer phone.
- `/admin/pulse`: StryvAdmin appointment and meal command center.
- `/admin/workouts`: trainer workout builder with wger exercise library.
- `/admin/settings`: trainer phone/name settings.
- `/api/wger/exercises`: server proxy for exercise lookup from `WGER_API_BASE_URL`.
- `/api/admin/workout-routines`: admin save/publish path for Stryv workout routines, with optional wger sync state.
- `/api/client/workout-routines`: authenticated client read path for published workout routines.
- `/api/admin/appointment-plans`: admin save/publish path for appointment preparation and follow-up plans.
- `/api/client/appointment-plans`: authenticated client read path for published appointment plans.
- `/api/admin/meal-plans`: admin save/publish path for Ideal Nutrition meal plans.
- `/api/client/meal-plans`: authenticated client read path for published meal plans.
- `/api/client/posts`: authenticated client read path for published admin posts.
- `/api/client/requests`: authenticated client note/meal-change request persistence.
- `/api/admin/client-requests`: admin review/status path for client note/meal-change requests.
- `/api/admin/client-notes`: admin trainer-note creation and publish path.
- `/api/client/notes`: authenticated client read path for published trainer notes.
- `/api/incidents`: incident health, support capture, dedupe, and Linear filing.
- `/api/incidents/sync-resolution`: marks incidents resolved and publishes update records.

## Runtime Dependencies

- Supabase: auth, app settings, support incidents, update records, future client data.
- Stripe: subscription/payment state; currently not fully wired into the client phase gate.
- Google Calendar handoff: local themed scheduler creates Google Calendar event URLs.
- Ideal Nutrition Browserbase ingestion: meal data source through `BROWSERBASE_API_KEY`, with fallback behavior in code.
- Linear: Solvys support issue filing from incidents.
- wger: self-hosted exercise/workout data source via `WGER_API_BASE_URL`.
- PWA runtime: manifest, service worker, install-to-home-screen flow.

## Production Booking And Payments (2026-06-01)

- `/book` + `/api/bookings/checkout` + `/api/bookings/availability` — live on Cloudflare Worker `stryvfit-plus` (Ashley account).
- Stripe Checkout + webhook at `/api/stripe/webhook` — confirms paid bookings and Google Calendar events.
- Booking consent form is required in the `/book` scheduler before session bookings; the form URL defaults to the provided Google Form and can be overridden with `NEXT_PUBLIC_BOOKING_CONSENT_FORM_URL`.
- Google Calendar failures no longer block booking confirmation; the app confirms the Supabase booking and files a support incident for calendar follow-up.
- Trainer availability persisted in Supabase; admin PUT `/api/admin/booking-availability`.
- Meal prep booking is **free** (Ideal Nutrition affiliate only).
- See `docs/ASHLEY-LAUNCH-READY.md` for Ashley’s 5-minute verify list.

## Known Simulation And Pending Wiring

- Client phase flow (`ClientPhaseFlow`) still uses URL query params for remote workout countdown demos (`?session=remote`, `?pastDueDays=7`). This is separate from the production booking flow on `/book`.
- Subscription past-due lockout on the phase flow is not yet tied to live Stripe subscription state.
- "Post to client" now has backend persistence at `/api/admin/publish` and authenticated client reads at `/api/client/posts`; the visible buttons remain stateful UX until a frontend wiring pass is allowed.
- `/admin/workouts` has backend routine persistence through `/api/admin/workout-routines`; direct multi-endpoint wger sync remains dependent on a reachable wger host plus `WGER_API_TOKEN`.
- `/admin/pulse` has backend appointment-plan persistence through `/api/admin/appointment-plans`; visible posting still needs the frontend wiring pass.
- `/admin/pulse?tab=meals` and `/admin/nutrition` have backend meal-plan persistence through `/api/admin/meal-plans`; visible publishing still needs the frontend wiring pass.
- Client note and meal-plan-change requests have Supabase-backed APIs; the visible meal planner still uses the legacy local browser helper until frontend wiring is allowed.
- Trainer notes have modern Clerk/app-user-backed APIs; the `/notes` page remains visually placeholder until frontend wiring is allowed.

## Validation Gates

Run from `app/` unless noted:

```bash
npm run typecheck
npm run build
curl -fsS http://localhost:3001/api/wger/exercises?limit=2
bun run smoke:support
```

Use `RUN_LIVE_INCIDENT_SMOKE=1 bun run smoke:support` only when Supabase and Linear envs are configured and TP expects a real support incident/Linear ticket.

## Related Handoff Docs

- `docs/ASHLEY-LAUNCH-READY.md`: client launch verify + Solvys deploy commands.
- `docs/ASHLEY-REDEPLOY-CHECKLIST.md`: Cloudflare secret/DNS migration pack.
- `docs/OPERATOR-GUIDE.md`: non-technical guide for client/admin app usage.
- `docs/CHATGPT-CONTROL-PROTOCOL.md`: how ChatGPT/Codex should control and support the admin UI.
- `docs/SUPPORT-PROTOCOL.md`: Solvys support engine and incident workflow.
- `docs/WGER-HANDOFF.md`: wger cloud/app integration guide.
- `app/README.md`: developer setup summary.
- `infra/wger/README.md`: deploy/runbook for the self-hosted wger stack.
