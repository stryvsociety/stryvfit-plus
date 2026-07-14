# S3 Brief: Mobile Membership Invoice Handoff

Date: 2026-07-14
Branch: `codex/ssf-guided-booking-flow`

## Original problem

A real mobile client can complete a free first-session booking, but the signed-in booking path attempts to call `history.replaceState()` with the app subdomain while the page is served from the public domain. Safari rejects that cross-origin history update, so the client sees an internal browser error instead of a confirmation. The same signed-in route has a constrained-width duration control that crops and overlaps its choices. Billing then advertises Cash App Pay and PayPal even though Stripe reports both methods as unavailable, and it has no trustworthy path from a completed free session to a payable membership invoice.

## Solution

Ship one gated path: a client who has a confirmed free session selects the coach-confirmed in-person membership package in billing settings and taps one explicit Stripe CTA. The server creates or safely reuses a manually finalized Stripe invoice with `collection_method=send_invoice` and `auto_advance=false`, returns its Hosted Invoice Page URL, and the client navigates there. Stripe owns payment collection; the app never gathers payment details. The invoice must be unpaid and payable when returned, and repeated taps must reuse the existing open invoice rather than create a second charge.

The first release covers the three existing one-off StryvFit+ in-person packages (`sessions_4`, `sessions_8`, and `sessions_12`). Those are the existing live Stripe one-time prices and match the public in-person offers. Remote coaching remains on the existing subscription Checkout path because treating a recurring price as a one-off invoice would silently remove recurring billing semantics.

## Scope and decisions

- Remove Cash App Pay and PayPal from application types, display configuration, environment examples, Stripe provisioning/audit requirements, and any current customer-facing payment-method chips. Stripe’s live payment-method configuration already reports both unavailable; do not attempt to enable them.
- Replace the payment-method-chip area with a single membership-invoice CTA after a required package selection. Existing billing-portal and retry controls remain only where they handle an existing bill; they are not presented as payment-method choices.
- Correct every cross-origin booking `replaceState()` use found in the product paths so an absolute API redirect is reduced to a same-origin path before history mutation. The client scheduler path is the reported production failure; the meal-planning path has the same latent defect and is included.
- Make the logged-in duration control preserve its intrinsic width and wrap/stack at constrained mobile widths. It must not crop either 30m or 60m at 320px, 375px, or 390px.
- Strip meal prep from shipped client and admin navigation, phase transitions, and route handoffs while retaining the component, API, and supporting source for a future intentional integration.
- Do not create a subscription simply to get an invoice: Stripe documents that `send_invoice` subscriptions become active regardless of the first invoice status, which would make unpaid membership state misleading.

## Live system facts and blockers

- Stripe audit ran against the live account: all six configured StryvFit+ prices, billing portal, and required webhook events are present; Cash App Pay and PayPal are unavailable. No card or payment was submitted in prior QA.
- Production sign-up currently renders from both public/app host routes without a reproduced network failure. The Safari failure in the supplied evidence is explained by the cross-origin `replaceState()` call in the signed-in booking component.
- The Linear `Awaiting Review` audit was attempted on 2026-07-14 and blocked because the connected Linear OAuth token requires reauthentication. This is recorded rather than represented as a pass; no Linear issues will be created or changed in this delivery.

## Design pass

The change stays inside the existing dark StryvFit visual system, fonts, spacing, cards, and gold action color. Billing becomes quieter: one package choice, one clear amount, and one Stripe handoff. No new gradients, shadows, payment badges, or custom visual language are introduced. The scheduler keeps the existing segmented-control language but no longer lets the flexible row shrink below the two label targets.

## User journey

1. On mobile, a signed-in first-time client completes the consent-backed free-session flow.
2. The confirmation stays on the current origin; no browser history security error is possible.
3. The now-returning client opens billing settings, chooses the in-person package their coach confirmed, and taps the Stripe invoice CTA.
4. The authenticated API verifies the free-session gate, validates the package, creates/reuses the Stripe customer, finds any existing open membership invoice, or creates a draft with only the selected price, then finalizes it manually with automatic advancement off.
5. The response contains the finalized invoice’s `hosted_invoice_url`, and the browser performs a full navigation to Stripe.
6. The same mobile browser sees a payable Hosted Invoice Page. A repeated CTA tap reopens the same invoice, and a different package is rejected while that invoice remains open so the customer is never double-billed.

## Acceptance gates

- The public-host free-session confirmation no longer triggers a browser `ERR_FAILED`/cross-origin history exception.
- The logged-in scheduler duration choices fit and remain individually tappable at 320px, 375px, and 390px, with no horizontal overflow or text overlap.
- Cash App Pay and PayPal have no application display/config/provisioning references, and Stripe audit no longer expects them to be available.
- An eligible client can obtain a real, open, live Stripe Hosted Invoice Page for one selected in-person package without entering payment data in the app.
- The API prevents cross-user invoice access, non-client free-session bypasses, unsupported prices, and duplicate open membership invoices.
- Unit/type/lint/build checks pass, then the deployed public and authenticated mobile surfaces are exercised with real browser interaction. A final review rechecks this brief, the shared design canon, generated diff, Stripe object state, and the production journey before commit.

## Validation plan

- Add deterministic unit coverage for membership service validation, customer/invoice reuse, open-invoice conflict, and host-safe redirect normalization.
- Run focused tests after each code step, then the complete test suite, typecheck, lint, build, and diff check before deploy.
- Exercise the deployed public booking origin and live Stripe API. Do not submit a payment; stop at the payable hosted invoice page and record the invoice ID/status/amount/link.
- Capture rendered mobile evidence at 320px, 375px, and 390px after the final deploy.

## Progress log

- 2026-07-14: Brief created after live Stripe and production-route diagnosis. Implementation has not started at this checkpoint.
- 2026-07-14: Implemented the gated hosted-invoice API, account billing CTA, same-origin redirect normalization, removal of Cash App Pay/PayPal application configuration, and removal of meal-prep client/admin navigation. An open invoice is reused only for the same selected package; a different pending package is rejected.
- 2026-07-14: Local browser E2E completed the sandbox mobile free-session flow and reached the same-origin `?booking=confirmed` state with the membership-billing handoff visible. The previous cross-origin `replaceState` exception did not occur. Local console output contained the known production-Clerk-key/localhost origin mismatch only.
- 2026-07-14: The 320px screenshot backend exposed its own limitation: it renders a 1280px CSS viewport scaled to 320px, so it cannot honestly prove the CSS mobile breakpoints. Its interactive duration-toggle check passed, and the scheduler layout was changed to stack at the real Tailwind mobile breakpoint; deployed mobile-device verification remains required.
- 2026-07-14: Production build initially exposed a server-only `next/headers` import crossing into the client admin bundle. The client now uses its local name formatter and imports booking contracts as types only. Final local gate passed: `bun test` (81 passing), `bun run typecheck`, `bun run lint`, `bun run build`, and `git diff --check`.
- 2026-07-14: Final surface review found remaining meal-prep API handlers and admin booking select options. The handlers now return 404, legacy `meal_prep` is no longer parsed into a live booking service, and every active picker excludes it. The underlying meal-prep source remains retained for a later intentional integration.
