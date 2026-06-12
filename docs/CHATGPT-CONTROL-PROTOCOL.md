# ChatGPT Control Protocol

This is the operating protocol for ChatGPT/Codex sessions that manage SSFitness.

## Startup Checklist

On every new onboarding or support session:

1. Confirm current directory is `/Users/tifos/Desktop/SSFitness`.
2. Read `docs/HANDOFF.md`.
3. Read `app/README.md`, `infra/wger/README.md`, and `app/.env.example`.
4. Inspect relevant files before acting:
   - Client flow: `app/src/components/client/ClientPhaseFlow.tsx`
   - Admin appointments/meals: `app/src/components/admin/TrainerOpsStudio.tsx`
   - Admin workouts: `app/src/components/admin/AdminWorkoutsPage.tsx`
   - Support chat: `app/src/components/admin/AdminSupportChat.tsx`
   - wger client: `app/src/lib/wger.ts`
5. Check whether the app is running locally at `http://localhost:3001`.
6. If controlling UI, use browser automation against the local app or deployed admin URL.

## Control Rules

- Never invent client data. Use visible UI state, Supabase-backed records, wger API responses, or ask TP.
- Never claim production publish/payment/session wiring is complete when the current implementation is simulated.
- Before destructive, irreversible, or client-visible actions, confirm with TP unless TP explicitly says to proceed.
- For "show me" requests, navigate and explain without mutating state.
- For "draft" requests, prepare content but stop before publishing.
- For "publish" requests, verify selected client, target page, content summary, and expected visibility first.
- For support requests, include route, severity, message, context, and expected Linear behavior.

## Admin UI Control Map

- `/admin/pulse`: appointments, meal operations, client readiness, System Health.
- `/admin/pulse?tab=meals`: direct meal tab.
- `/admin/workouts`: workout builder, wger library, support request panel, training week, schedule timeline.
- `/admin/settings`: trainer settings.
- `/api/admin/workout-routines`: backend save/publish path for workout routines.
- `/api/client/workout-routines`: authenticated client read path for published workout routines.
- `/api/admin/meal-plans`: backend save/publish path for Ideal Nutrition meal plans.
- `/api/client/meal-plans`: authenticated client read path for published meal plans.
- `/api/client/requests`: authenticated client note/meal-change request persistence.
- `/api/admin/client-requests`: admin review/status path for client requests.
- `/api/admin/client-notes`: admin trainer-note creation and publish path.
- `/api/client/notes`: authenticated client read path for published trainer notes.

Expected UI controls:

- Client selector cards on the left.
- Top section nav: Appointments, Workouts, Meals.
- Theme toggles on admin/client surfaces.
- "Post to client" button. Backend persistence/read routes are `/api/admin/publish` and `/api/client/posts`; the visible button still needs a frontend wiring pass before claiming live client delivery.
- Support request box on admin workout surface.
- System Health card in admin sidebars.

## Prompt Templates For TP

First device setup:

```text
Good Afternoon Chat, this is TP, your FDE. We're about to begin onboarding, please set everything up.
```

Health check:

```text
Chat, inspect SSFitness health. Check env coverage, local app status, /api/incidents, /api/wger/exercises, and the admin pages. Tell me what's ready and what's blocked.
```

Admin walkthrough:

```text
Chat, open StryvAdmin and walk me through appointments, meals, workouts, support, and System Health without changing anything.
```

Workout drafting:

```text
Chat, draft a workout for [client]. Use the wger exercise library if it is connected. Stop before publishing and summarize what changed.
```

Meal drafting:

```text
Chat, draft a meal plan for [client] using Ideal Nutrition options. Stop before publishing and summarize calories/protein/cost.
```

Support filing:

```text
Chat, file a [low/medium/high/critical] support request: [issue]. Then verify whether it reached System Health and Linear.
```

Client flow QA:

```text
Chat, test the client flow for no session, remote session, workout completion, meal prep, journaling, and 7-day payment lockout.
```

## Verification Commands

From `app/`:

```bash
npm run typecheck
npm run build
curl -fsS http://localhost:3001/api/wger/exercises?limit=2
bun run smoke:support
```

For live support ticket testing only:

```bash
RUN_LIVE_INCIDENT_SMOKE=1 bun run smoke:support
```

## Handling Common States

If the app is not running:

```bash
cd app
npm run dev
```

If System Health says "Setup needed":

- Check Supabase envs first.
- Check `INCIDENT_WEBHOOK_SECRET` if protected incident calls are failing.
- Check Linear envs if incidents capture but filing fails.
- Run `bun run smoke:support` for endpoint shape and priority mapping.

If wger shows fallback:

- Check `WGER_API_BASE_URL`.
- Confirm `infra/wger` is deployed or use public `https://wger.de` for temporary lookup.
- Call `/api/wger/exercises?limit=2`.

If payment/session behavior looks fake:

- It probably is. Current demo state uses URL params.
- Do not present demo query params as live Stripe/Supabase state.
