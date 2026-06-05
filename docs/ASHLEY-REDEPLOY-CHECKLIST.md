# StryvFit+ — Redeploy on Ashley’s Cloudflare Account

**Solvys Cloudflare (client project)**

| Item | Value |
|------|--------|
| Account ID | `8a3f2e4671b2ce8cca031fb0ce8ecfe8` |
| Zone ID (`stryvsocietyfit.com`) | `22998ccbcc56665c9e7f3ca5315981e7` |
| Worker name | `stryvfit-plus` |
| Workers.dev URL | `https://stryvfit-plus.ashley-8a3.workers.dev` |

API token lives in `app/.env.local` as `CLOUDFLARE_API_TOKEN` (never commit). Rotate if exposed.

**Status (2026-06-01):** Worker deployed (version `72f1e37b`), 35 secrets synced, all four routes live. **Client verify:** `docs/ASHLEY-LAUNCH-READY.md`.

Use this after the domain is on Ashley’s Cloudflare account and DNS is pointed correctly.

## What we already captured locally

| Artifact | Location | Notes |
|----------|----------|--------|
| **Full secret values** | `app/.cloudflare-redeploy.env` | Gitignored. 36 keys populated from `.env.local` + Supabase CLI. **Copy from this file into Ashley’s Worker secrets.** |
| Key names only (safe) | `app/.cloudflare-redeploy.env.example` | Safe to reference; no values. |
| App code + build | Git repo `SSFitness/app` | Latest booking/payment fixes included. |
| Supabase DB | Project **StryvFit+** (`lpvujmzfqhpjklntetae`) | Migrations already applied remotely. |
| Stripe | Ashley’s **live** Stripe | 6 prices + webhook URL already configured. |
| Google Calendar | Refresh token in redeploy pack | Token was validated OK before unlink. |

**Could not pull** secrets from the old Cloudflare Worker (API auth on wrong account expired). The redeploy pack is built from your machine’s `.env.local` plus Supabase—not from Cloudflare’s copy.

---

## Before you delete the old Worker

- [ ] Confirm `app/.cloudflare-redeploy.env` exists on your Mac and opens in a text editor.
- [ ] Optional: copy that file to 1Password / Apple Notes / encrypted backup (Ashley’s vault).

---

## Step 1 — Ashley’s Cloudflare account IDs

1. Ashley logs into [dash.cloudflare.com](https://dash.cloudflare.com).
2. Open **stryvsocietyfit.com** (after DNS move).
3. Right sidebar → copy **Zone ID** (new ID; the old `4983dc13…` in `wrangler.jsonc` is invalid).
4. **Account ID**: from any zone URL or **Workers & Pages** overview.

Update `app/wrangler.jsonc` → replace all four `zone_id` entries under `routes` with the **new** Zone ID.

---

## Step 2 — Deploy Worker to Ashley’s account

1. On your Mac, Wrangler must be logged into **Ashley’s** Cloudflare (not the old account).
2. From the `app` folder, run the project’s Cloudflare deploy script (same as before: OpenNext build + deploy).
3. In Ashley’s dashboard: **Workers & Pages** → **stryvfit-plus** → confirm it exists after deploy.

---

## Step 3 — Worker routes (after zone is active)

In Ashley’s dashboard → **stryvfit-plus** → **Settings** → **Triggers** / **Routes**, attach:

| Route pattern |
|---------------|
| `stryvsocietyfit.com/*` |
| `www.stryvsocietyfit.com/*` |
| `app.stryvsocietyfit.com/*` |
| `book.stryvsocietyfit.com/*` |
| `admin.stryvsocietyfit.com/*` |

---

## Step 4 — Paste secrets (Production)

**Workers & Pages** → **stryvfit-plus** → **Settings** → **Variables and Secrets** → **Production**.

Open `app/.cloudflare-redeploy.env` and add each line as a **Secret** (encrypted), not plain text variables, for anything sensitive.

### Required for launch

| Secret | In redeploy pack? |
|--------|-------------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes |
| `CLERK_SECRET_KEY` | Yes |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Yes |
| `NEXT_PUBLIC_APP_URL` | Yes |
| `NEXT_PUBLIC_PUBLIC_URL` | Yes |
| `NEXT_PUBLIC_ADMIN_CANONICAL_URL` | Yes |
| `NEXT_PUBLIC_CLERK_PROXY_URL` | Yes |
| `STRIPE_SECRET_KEY` | Yes |
| `STRIPE_WEBHOOK_SECRET` | Yes |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Yes |
| All 6 `NEXT_PUBLIC_STRIPE_PRICE_*` | Yes |
| `GOOGLE_CLIENT_ID` | Yes |
| `GOOGLE_CLIENT_SECRET` | Yes |
| `GOOGLE_REFRESH_TOKEN` | Yes |
| `GOOGLE_CALENDAR_ID` | Yes |
| `BOOKING_TIMEZONE` | Yes |
| `ADMIN_EMAILS` | Yes |

### Optional (support / legacy)

| Secret | Notes |
|--------|--------|
| `INCIDENT_WEBHOOK_SECRET`, `SSFITNESS_LINEAR_*` | Support pipeline |
| `CAL_WEBHOOK_SECRET`, `NEXT_PUBLIC_CAL_*` | Legacy Cal.com |
| `BROWSERBASE_API_KEY` | Meal scrape |
| `WGER_API_TOKEN` | Workouts proxy |
| `CLERK_WEBHOOK_SIGNING_SECRET` | Only if Clerk webhooks used |

### Plaintext vars (can use “Variables” in dashboard)

These are also in `wrangler.jsonc` `vars` and can stay there or be set as variables:

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_PUBLIC_URL`
- `NEXT_PUBLIC_ADMIN_CANONICAL_URL`
- `NEXT_PUBLIC_CLERK_PROXY_URL`
- `NEXT_PUBLIC_CAL_*` (if still used)
- `WGER_API_BASE_URL`

Redeploy once after all secrets are saved.

---

## Step 5 — DNS (you’re doing this)

Minimum records on Ashley’s zone (proxied orange cloud):

| Name | Type | Target |
|------|------|--------|
| `@` | A or CNAME | Worker route / Cloudflare setup per their UI |
| `www` | CNAME | `stryvsocietyfit.com` or Worker |
| `app` | CNAME | `stryvsocietyfit.com` or Worker |
| `book` | CNAME | `stryvsocietyfit.com` or Worker |

Exact targets depend on whether you use Workers custom domains vs CNAME flattening—Cloudflare’s “Workers Routes” UI will guide you once the Worker is deployed.

---

## Step 6 — Verify (no old Worker)

1. Delete routes + Worker on the **old** account only after Ashley’s deploy works.
2. `https://app.stryvsocietyfit.com/book` → sign-in → free session book flow.
3. Paid session → Stripe Checkout → webhook confirms booking.
4. Admin → block a time → client sees slot unavailable.

---

## External services (unchanged URLs)

| Service | Action |
|---------|--------|
| **Stripe webhook** | Keep `https://app.stryvsocietyfit.com/api/stripe/webhook` — signing secret must match `STRIPE_WEBHOOK_SECRET` in new Worker. |
| **Clerk** | Production domains unchanged. |
| **Supabase** | Same project; keys in redeploy pack. |
| **Google** | Same OAuth client; refresh token in redeploy pack. |

---

## Empty keys in redeploy pack (fill only if you use the feature)

Check `app/.cloudflare-redeploy.env` for any `KEY=` lines with no value—optional integrations only.
