# StryvFit+ — Launch Ready (Ashley)

**Last deploy:** 2026-06-01 · Worker version `0b3184db-edb0-4461-86a0-cb435ab596f0`

## If the site won’t load (SSL / “not deployed”)

The Worker **is** on Cloudflare (`stryvfit-plus` + all 4 routes). A broken browser usually means **HTTPS certificate still issuing**, not a missing deploy.

1. Cloudflare dashboard → **stryvsocietyfit.com** → **SSL/TLS** → **Edge Certificates**.
2. Find **Universal SSL** — if status is *Pending*, click **Disable**, wait 30 seconds, **Enable** again.
3. Wait 5–15 minutes, then hard-refresh https://stryvsocietyfit.com and https://app.stryvsocietyfit.com.

Solvys can also run from `app/`:

```bash
bun run cf:fix-ssl    # ACME TXT + book DNS + re-validation
bun run cf:secrets    # 26 Worker secrets (skips wrangler.jsonc vars)
bun run cf:deploy     # fresh OpenNext deploy
```

**book.stryvsocietyfit.com** DNS was missing — now added (proxied A records).
**Solvys ops:** deploy from `app/` with `bun run cf:deploy` (loads `app/.env.local` automatically).

## Live URLs

| URL | Purpose |
|-----|---------|
| https://stryvsocietyfit.com | Marketing landing |
| https://app.stryvsocietyfit.com | Member app (Clerk sign-in) |
| https://app.stryvsocietyfit.com/book | Book sessions |
| https://book.stryvsocietyfit.com | Same Worker → `/book` |
| https://admin.stryvsocietyfit.com | Redirects → apex admin (vanity URL; same Clerk app) |
| https://stryvfit-plus.ashley-8a3.workers.dev | Workers.dev fallback |

## What’s shipped

- **Stripe Checkout** — in-person packages + 3 online coaching subscriptions (live prices in Worker secrets).
- **Stripe webhook** — `https://app.stryvsocietyfit.com/api/stripe/webhook` confirms paid bookings (`constructEventAsync` on Workers).
- **Google Calendar** — server creates events after payment / free booking; themed scheduler on `/book`.
- **Trainer availability** — stored in Supabase `app_settings.booking_availability`; enforced on checkout; admin edits in scheduler “manage availability” mode.
- **Consent form** — `/book` requires clients to open and acknowledge the Google consent form before confirming session bookings.
- **Calendar fallback** — if Google Calendar has a temporary credential/API issue, the booking still confirms in Supabase and files a support incident for manual calendar follow-up.
- **Meal prep** — retired from the live application; source remains archived for a later integration.
- **Clerk auth** — sign-in/up on production domains.
- **Landing** — comparison section removed per client request.

## StryvAdmin (trainer dashboard)

Full admin UI (appointments, workouts, meals, settings):

- **https://stryvsocietyfit.com/admin/pulse** (canonical — one Clerk app)
- **https://admin.stryvsocietyfit.com** → redirects here (vanity only; do not add a second Clerk domain)

Trainer sign-in: **https://stryvsocietyfit.com/sign-in-admin** (use Google). Only emails in `ADMIN_EMAILS` (Worker secret) are allowed.

**Clerk:** Keep a single production domain (`stryvsocietyfit.com` with proxy at `stryvsocietyfit.com/__clerk`). Enable **Google** under Social connections; disable email/password if you want Google-only. Do not put Cloudflare Access or IP allow rules in front of StryvAdmin; access is controlled by Google OAuth plus `ADMIN_EMAILS`.

## Ashley checklist (5 minutes)

1. Open https://app.stryvsocietyfit.com/book — sign in as a test user.
2. Open + acknowledge the consent form, then book **free first session** — confirm Google Calendar invite or “invite being finalized” confirmation UI.
3. Book a **paid** session — complete Stripe test or live card — confirm booking row + calendar.
4. Admin (Ashley email in `ADMIN_EMAILS`) → block a time slot → confirm client cannot select it.
5. Stripe Dashboard → Webhooks → recent `checkout.session.completed` deliveries = 200.

## Solvys maintenance

```bash
cd app
bun run cf:deploy      # build + deploy Worker
bun run cf:secrets     # sync secrets from .cloudflare-redeploy.env / .env.local
bun run stripe:setup   # recreate missing Stripe prices (live key in .env.local)
bun run typecheck
```

**Cloudflare:** Account `8a3f2e4671b2ce8cca031fb0ce8ecfe8` · Zone `22998ccbcc56665c9e7f3ca5315981e7` · Worker `stryvfit-plus`.

**Supabase:** Project **StryvFit+** `lpvujmzfqhpjklntetae` — migrations applied including `booking_availability`.

## Safe to delete (old account)

After steps 1–5 pass on Ashley’s zone: remove Worker + routes on the **previous** Cloudflare account only. Secrets are in `app/.cloudflare-redeploy.env` (gitignored), not on the old Worker.

## Still optional / not launch-blocking

- `CLERK_WEBHOOK_SIGNING_SECRET` — only if Clerk webhooks are enabled.
- `CAL_WEBHOOK_SECRET` — legacy Cal.com.
- `WGER_API_TOKEN` — private wger routine writes (exercise read works without).
- Client phase flow (`ClientPhaseFlow`) still uses URL demo params for remote workout countdown; **booking/payments are production**.

## Docs

- `docs/ASHLEY-REDEPLOY-CHECKLIST.md` — full secret list + DNS
- `docs/HANDOFF.md` — agent entrypoint
- `docs/OPERATOR-GUIDE.md` — trainer day-to-day
