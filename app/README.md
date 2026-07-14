# StryvFit+ PWA

Member portal for Stryv Society Fitness. Lives at `app.stryvsocietyfit.com`.

## Handoff Pack

The complete ChatGPT/Codex and operator handoff lives in the repo-root `docs/` folder:

- `docs/HANDOFF.md` — primary agent entrypoint and current-state snapshot
- `docs/OPERATOR-GUIDE.md` — non-technical app/admin usage guide
- `docs/CHATGPT-CONTROL-PROTOCOL.md` — how ChatGPT should inspect and control admin workflows
- `docs/SUPPORT-PROTOCOL.md` — Solvys support engine protocol
- `docs/DELIVERY-SETUP-GUIDE.md` — client onboarding, Supabase, Cloudflare Workers, and Linear setup checklist
- `docs/WGER-HANDOFF.md` — wger cloud/app integration guide

This README is the app developer summary, not the full operator guide.

## Stack

- Next.js 14 (App Router) + React 18 + Tailwind
- Supabase (auth, Postgres, RLS, realtime)
- Stripe Checkout for in-person packages and monthly online coaching subscriptions
- Google Calendar handoff through a Stryv-themed scheduler
- Browserbase Fetch API for Ideal Nutrition menu ingestion
- Self-hosted wger exercise/workout data via `WGER_API_BASE_URL`
- PWA: web manifest + service worker, install-to-home-screen on iOS/Android
- Solvys Gold theme on Stryv brand surface

## Tabs

- `/book` — Stryv-themed scheduler that creates Google Calendar events
- `/notes` — trainer notes (Supabase realtime, RLS per client)
- `/coach` — iMessage CTA via `sms:` deep link to admin-configured trainer phone
- `/admin/pulse` — StryvAdmin dashboard for scheduling, nutrition, and support health workflows
- `/admin/workouts` — trainer workout builder backed by the wger exercise library proxy

## Admin

- `/admin/settings` — trainer phone (E.164), trainer name, success toast on save
- `/admin/pulse` — appointments + Ideal Nutrition recipe picker + Google Calendar scheduling handoff
- `/admin/workouts` — workout blocks, remote video notes, training week, and wger exercise library

## wger

- Cloud stack lives in `../infra/wger`.
- App proxy endpoint: `/api/wger/exercises`.
- Configure `WGER_API_BASE_URL=https://workouts.stryvsocietyfit.com` once the self-hosted instance is live.
- `WGER_API_TOKEN` is optional for public exercise lookup and required later for private routine writes.

## Support Pipeline

- Remote incidents post to `/api/incidents`, dedupe in Supabase, and auto-file Linear issues to the SSFitness workspace.
- `/admin/pulse` shows open incidents, Linear links, and published fix records in System Health.
- Scheduled Codex should poll completed SSFitness Linear incident tickets and call `/api/incidents/sync-resolution` with `INCIDENT_WEBHOOK_SECRET`.

```bash
bun run smoke:support
RUN_LIVE_INCIDENT_SMOKE=1 bun run smoke:support
```

## Setup

```bash
cd app
bun install        # or: npm install
cp .env.example .env.local
# fill values
bun run typecheck
bun run dev        # http://localhost:3001
```

Then run `supabase/schema.sql` in the Supabase SQL editor.

## Deploys

- App/Admin/API/PWA → Cloudflare Workers using `@opennextjs/cloudflare`
- From `app/`: `bun run cf:deploy` (reads `CLOUDFLARE_*` from `.env.local`) · `bun run cf:secrets` to sync Worker secrets
- Client launch checklist: `../docs/ASHLEY-LAUNCH-READY.md`
- Supabase → hosted Postgres, migrations in `supabase/migrations`
- Linear → automatic Solvys support tickets from `/api/incidents`
- DNS: `app.stryvsocietyfit.com` and `book.stryvsocietyfit.com` point to the same Cloudflare Worker; `book` can route users directly to `/book` through DNS/redirect policy if desired
- Rollback path → Fly.io using the preserved `Dockerfile` + `fly.toml`

```bash
bun run cf:preview
bun run cf:deploy
```
