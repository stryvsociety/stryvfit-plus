# StryvFit+ Delivery Setup Guide

Use this before handing the PWA to a client. The production shape is:

- StryvFit+ client PWA and StryvAdmin in one Next.js app.
- Supabase for database state, incidents, update records, notes, trainer settings, and client requests.
- Linear for automatic Solvys support tickets.
- Cloudflare Workers for the Next.js app, admin dashboard, API routes, service worker, and static PWA assets through `@opennextjs/cloudflare`.
- Fly.io remains a rollback-only Node/Docker path. The app still includes a Fly-ready Dockerfile and `fly.toml` in `app/`.
- Google Calendar handoff through the themed scheduler UI. The current delivery does not require Google Calendar embeds.

Official references:

- Cloudflare Workers Next.js guide: https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/
- OpenNext Cloudflare adapter: https://opennext.js.org/cloudflare
- Cloudflare Workers secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Supabase migrations: https://supabase.com/docs/guides/deployment/database-migrations
- Linear GraphQL API: https://linear.app/developers/graphql?noRedirect=1
- Fly deploys, rollback only: https://fly.io/docs/apps/deploy/

## 1. Client-Facing Onboarding

1. Confirm brand and app names.
   - Public client app: `StryvFit+`
   - Admin dashboard: `StryvAdmin`
   - Brand mark: `Stryv Society`

2. Confirm the client-facing routes.
   - `/book` is the installable PWA entry.
   - `/meals` is a direct meal-prep surface.
   - `/coach` is the coach contact surface.
   - `/notes` is the trainer-note surface; backend APIs are `/api/admin/client-notes` and `/api/client/notes`.

3. Configure trainer identity.
   - Open `/admin/settings`.
   - Save trainer name.
   - Save trainer phone in E.164 format, for example `+13053479816`.
   - Verify `/coach` opens the message CTA.

4. Configure Ideal Nutrition handoff.
   - Set the trainer affiliate code in the meal link configuration when available.
   - Use `/admin/pulse?tab=meals` to recommend the meals clients should see.
   - Backend meal-plan persistence is `/api/admin/meal-plans` and client reads are `/api/client/meal-plans`.
   - Client-side meal cards should show only trainer-recommended meals and the affiliate-ready external link.
   - Client notes and meal-change requests persist through `/api/client/requests` and can be reviewed through `/api/admin/client-requests` once the visible UI is wired.

5. Configure scheduling behavior.
   - In StryvAdmin, set booking start times, buffer time, blocked times, and duration options.
   - Confirm `/book` can run the mock booking flow without relying on a live Google Calendar redirect.
   - Confirm the success overlay appears after booking: `You're all done for today. See you next session!`

6. Install-test the PWA.
   - iPhone Safari: open the production `/book` URL, Share, Add to Home Screen.
   - Android Chrome: open the production `/book` URL, Install app.
   - Desktop Chrome: open the production `/book` URL and use the install icon when available.

7. Client handoff script.
   - Give the client only the PWA URL and a short install instruction.
   - Give the trainer/admin the admin URL separately.
   - Keep Linear, Supabase, Cloudflare, and rollback Fly credentials internal to Solvys.

## 2. Supabase Setup

1. Create a Supabase project for the client.

2. From the app folder, link the project:

```bash
cd /Users/tifos/Desktop/SSFitness/app
supabase login
supabase link
```

3. Preview migrations:

```bash
supabase db push --dry-run
```

4. Apply migrations:

```bash
supabase db push
```

5. If seed data is wanted for the first trainer demo:

```bash
supabase db push --include-seed
```

6. Copy project values into Cloudflare Worker secrets:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

7. Verify health from production after deploy:

```bash
curl -fsS https://app.stryvsocietyfit.com/api/incidents
```

The response should be JSON with `incidents` and `updates` arrays, even when empty.

## 3. Linear Error Handling Setup

1. In Linear, create or confirm the Solvys team/project.

2. Create labels:
   - `client-incident`
   - `ssf-pwa`
   - `severity-low`
   - `severity-medium`
   - `severity-high`
   - `severity-critical`

3. Copy Linear UUIDs from the Linear command menu with `Copy model UUID`.
   - Solvys team ID
   - Solvys project ID
   - default assignee ID
   - label IDs, comma-separated

4. Set Cloudflare Worker secrets:

```bash
LINEAR_API_KEY=
LINEAR_DEFAULT_ASSIGNEE_ID=
LINEAR_SOLVYS_TEAM_ID=
LINEAR_SOLVYS_PROJECT_ID=
LINEAR_INCIDENT_LABEL_IDS=
INCIDENT_WEBHOOK_SECRET=
```

5. Run the dry smoke:

```bash
cd /Users/tifos/Desktop/SSFitness/app
bun run smoke:support
```

6. Run the live smoke only after Supabase and Linear env vars are set:

```bash
RUN_LIVE_INCIDENT_SMOKE=1 bun run smoke:support
```

Expected result: one Supabase `support_incidents` row and one Linear ticket assigned to `LINEAR_DEFAULT_ASSIGNEE_ID`.

## 4. Cloudflare Workers App Deployment

Cloudflare Workers is the primary deployment path for the website, client PWA, StryvAdmin, service worker, static assets, and Next.js API routes.

The app includes:

- `app/wrangler.jsonc`
- `app/open-next.config.ts`
- `app/public/_headers`
- `app/.dev.vars`
- Cloudflare scripts in `app/package.json`

1. Install dependencies:

```bash
cd /Users/tifos/Desktop/SSFitness/app
bun install
```

2. Log in to Cloudflare once:

```bash
bunx wrangler login
```

3. If this is the first time the Worker is being created, upload a version before setting secrets:

```bash
bun run cf:upload
```

This creates `stryvfit-plus` and uploads a non-production Worker version. Do not send production traffic until the secrets below are present.

4. Set Worker secrets. Public values are still deployment values because Next.js reads them at build/runtime, but service-role and API keys must never be committed:

```bash
bunx wrangler secret put NEXT_PUBLIC_SUPABASE_URL
bunx wrangler secret put NEXT_PUBLIC_SUPABASE_ANON_KEY
bunx wrangler secret put SUPABASE_SERVICE_ROLE_KEY
bunx wrangler secret put BROWSERBASE_API_KEY
bunx wrangler secret put INCIDENT_WEBHOOK_SECRET
bunx wrangler secret put LINEAR_API_KEY
bunx wrangler secret put LINEAR_DEFAULT_ASSIGNEE_ID
bunx wrangler secret put LINEAR_SOLVYS_TEAM_ID
bunx wrangler secret put LINEAR_SOLVYS_PROJECT_ID
bunx wrangler secret put LINEAR_INCIDENT_LABEL_IDS
bunx wrangler secret put CAL_WEBHOOK_SECRET
bunx wrangler secret put STRIPE_SECRET_KEY
bunx wrangler secret put STRIPE_WEBHOOK_SECRET
bunx wrangler secret put NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
bunx wrangler secret put NEXT_PUBLIC_STRIPE_PRICE_COACHING
bunx wrangler secret put NEXT_PUBLIC_STRIPE_PRICE_PREMIUM
bunx wrangler secret put WGER_API_TOKEN
```

5. Confirm the expected secrets exist:

```bash
bunx wrangler secret list
```

Required before production traffic:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `INCIDENT_WEBHOOK_SECRET`
- `LINEAR_API_KEY`
- `LINEAR_DEFAULT_ASSIGNEE_ID`
- `LINEAR_SOLVYS_TEAM_ID`
- `LINEAR_SOLVYS_PROJECT_ID`
- `LINEAR_INCIDENT_LABEL_IDS`

Optional until those surfaces go live:

- `BROWSERBASE_API_KEY`
- `CAL_WEBHOOK_SECRET`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `NEXT_PUBLIC_STRIPE_PRICE_COACHING`
- `NEXT_PUBLIC_STRIPE_PRICE_PREMIUM`
- `WGER_API_TOKEN`

6. Preview in the Workers runtime:

```bash
bun run cf:preview
```

7. Smoke the preview URL printed by Wrangler:

```bash
curl -fsS "http://127.0.0.1:<preview-port>/book?mock=v20&session=remote" >/dev/null
curl -fsS http://127.0.0.1:<preview-port>/admin/pulse >/dev/null
curl -fsS http://127.0.0.1:<preview-port>/api/incidents >/dev/null
curl -fsS http://127.0.0.1:<preview-port>/manifest.webmanifest >/dev/null
curl -fsS http://127.0.0.1:<preview-port>/sw.js >/dev/null
curl -fsS http://127.0.0.1:<preview-port>/offline.html >/dev/null
```

8. Deploy only after the required secrets are present:

```bash
bun run cf:deploy
```

9. Attach custom domains in Cloudflare Workers:

- `app.stryvsocietyfit.com` -> `stryvfit-plus`
- `book.stryvsocietyfit.com` -> same Worker; optionally redirect `/` to `/book`
- `admin.stryvsocietyfit.com` -> same Worker; redirects to apex admin
- `stryvsocietyfit.com` -> same Worker root, unless marketing is split later

10. Smoke production:

```bash
curl -fsS https://app.stryvsocietyfit.com/book >/dev/null
curl -fsS https://stryvsocietyfit.com/admin/pulse >/dev/null
curl -fsS https://app.stryvsocietyfit.com/api/incidents
```

## 5. Rollback Hosts

Fly remains the rollback path if Cloudflare Workers is blocked by a runtime limit or account-level issue. The preserved rollback artifacts are:

- `app/Dockerfile`
- `app/fly.toml`

Fly rollback requires restoring or carrying a Next standalone build shape before Docker deploy, because Cloudflare/OpenNext compatibility is now the primary `next.config.js` target.

Vercel and Framer are not recommended defaults for this delivery. Framer cannot host the required Next.js API routes, Supabase service-role server calls, Linear issue creation, and service worker runtime. Vercel can run the app, but it is no longer the primary handoff path.

## 6. Pre-Delivery Checklist

Run these from `app/`:

```bash
bun run lint
bun run typecheck
bun test
bun run smoke:support
bun run build
bun run cf:preview
```

Then manually verify:

- `/book?mock=v20&session=remote`
- `/admin/pulse`
- `/admin/pulse?tab=meals`
- `/admin/workouts`
- `/admin/settings`
- PWA install prompt or install path on mobile
- One dry support incident
- One live support incident after real Linear/Supabase secrets exist

## 7. Codex/Linear Completion Loop

1. Client app captures an error and posts `/api/incidents`.
2. Supabase stores or dedupes `support_incidents`.
3. The app creates a Linear issue in Solvys and assigns it to the default assignee.
4. Solvys fixes the issue and marks the Linear ticket complete.
5. A scheduled Codex job checks completed `ssf-pwa` incident tickets.
6. Codex publishes an `app_update_records` row through `/api/incidents/sync-resolution`.
7. StryvAdmin shows the update record in System Health.
