#!/usr/bin/env node
/**
 * One-shot Stripe product/price provisioner for StryvFit+.
 *
 * Creates the products and prices the booking flow expects, verifies the Stripe
 * Billing Portal + webhook setup, then prints the NEXT_PUBLIC_STRIPE_PRICE_*
 * values to paste into Cloudflare Worker secrets.
 *
 * Safe to re-run: products are matched by metadata.stryv_service and prices by
 * lookup_key, so a second run reuses existing objects instead of duplicating.
 *
 * Reads STRIPE_ADMIN_SECRET_KEY or STRIPE_SECRET_KEY (and any already-set price
 * IDs) from .env.local, or from the environment. Prices already present in
 * .env.local are reused, so it only creates what is missing (e.g. the
 * online-coaching subscriptions).
 *
 * Meal prep is intentionally excluded — it is recommend-only (Ideal Nutrition
 * affiliate links) and the planning session is free.
 *
 * Usage:
 *   node scripts/setup-stripe-products.mjs                       # uses .env.local
 *   STRIPE_SECRET_KEY=sk_test_xxx node scripts/setup-stripe-products.mjs   # test mode
 *
 * Optional:
 *   STRIPE_CURRENCY=usd   # defaults to usd
 */

import fs from 'node:fs';
import path from 'node:path';
import Stripe from 'stripe';

function loadEnvLocal() {
  const file = path.resolve(process.cwd(), '.env.local');
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim();
  }
  return out;
}

const fileEnv = loadEnvLocal();
const env = { ...fileEnv, ...process.env };

const secretKey = env.STRIPE_ADMIN_SECRET_KEY || env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('Missing STRIPE_ADMIN_SECRET_KEY or STRIPE_SECRET_KEY (checked .env.local and environment).');
  process.exit(1);
}

const currency = (env.STRIPE_CURRENCY ?? 'usd').toLowerCase();
const mode = secretKey.includes('_live_') ? 'LIVE' : secretKey.includes('_test_') ? 'TEST' : 'UNKNOWN';
const stripe = new Stripe(secretKey, { apiVersion: '2026-05-27.dahlia' });
const appOrigin = (env.NEXT_PUBLIC_APP_URL ?? 'https://app.stryvsocietyfit.com').replace(/\/$/, '');
const publicOrigin = (env.NEXT_PUBLIC_PUBLIC_URL ?? 'https://stryvsocietyfit.com').replace(/\/$/, '');
const webhookUrl = `${appOrigin}/api/stripe/webhook`;
const REQUIRED_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.expired',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.payment_failed',
  'invoice.payment_action_required',
  'invoice.paid',
];
const REQUIRED_PAYMENT_METHODS = [
  { key: 'apple_pay', label: 'Apple Pay', env: 'STRIPE_ACCEPTS_APPLE_PAY' },
  { key: 'cashapp', label: 'Cash App Pay', env: 'STRIPE_ACCEPTS_CASH_APP_PAY' },
  { key: 'paypal', label: 'PayPal', env: 'STRIPE_ACCEPTS_PAYPAL' },
];

/**
 * Each entry maps a code service type -> Stripe product + price.
 * `envVar` is the variable the app reads (see src/lib/bookingServices.ts).
 * Amounts are in the smallest currency unit (cents). `interval` => subscription.
 */
const CATALOG = [
  {
    service: 'sessions_4',
    envVar: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4',
    name: 'StryvFit+ — 4 In-Person Sessions',
    description: 'Two-week training block with four in-person sessions.',
    amount: 12000,
    interval: null,
  },
  {
    service: 'sessions_8',
    envVar: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_8',
    name: 'StryvFit+ — 8 Sessions / Month',
    description: 'Monthly training rhythm with eight in-person sessions (2x per week).',
    amount: 20000,
    interval: null,
  },
  {
    service: 'sessions_12',
    envVar: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_12',
    name: 'StryvFit+ — 12 Sessions / Month',
    description: 'High-touch monthly package with twelve in-person sessions (3x per week).',
    amount: 30000,
    interval: null,
  },
  {
    service: 'online_coaching_starter',
    envVar: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_STARTER',
    name: 'StryvFit+ — Online Coaching (Starter)',
    description: 'Monthly online coaching: 4 sessions, weekly programming, check-ins, form review.',
    amount: 10000,
    interval: 'month',
  },
  {
    service: 'online_coaching_elevate',
    envVar: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELEVATE',
    name: 'StryvFit+ — Online Coaching (Elevate)',
    description: 'Monthly online coaching: 8 sessions, progressive programming, priority messaging.',
    amount: 18000,
    interval: 'month',
  },
  {
    service: 'online_coaching_elite',
    envVar: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELITE',
    name: 'StryvFit+ — Online Coaching (Elite)',
    description: 'Monthly online coaching: 12 sessions, advanced progression, priority support, goal tracking.',
    amount: 25000,
    interval: 'month',
  },
];

// Meal prep is intentionally excluded: meals are fulfilled by Ideal Nutrition
// via affiliate links and the planning session is free (no Stripe price).

function formatAmount(amount) {
  return `${(amount / 100).toLocaleString('en-US', { style: 'currency', currency: currency.toUpperCase() })}`;
}

async function findOrCreateProduct(item) {
  const query = `metadata['stryv_service']:'${item.service}'`;
  const found = await stripe.products.search({ query, limit: 1 });
  if (found.data[0]) {
    return { product: found.data[0], created: false };
  }
  const product = await stripe.products.create({
    name: item.name,
    description: item.description,
    metadata: { stryv_service: item.service },
  });
  return { product, created: true };
}

async function findOrCreatePrice(item, productId) {
  const lookupKey = `stryv_${item.service}`;
  const existing = await stripe.prices.list({ lookup_keys: [lookupKey], active: true, limit: 1 });
  if (existing.data[0]) {
    return { price: existing.data[0], created: false };
  }
  const price = await stripe.prices.create({
    product: productId,
    currency,
    unit_amount: item.amount,
    lookup_key: lookupKey,
    nickname: item.name,
    ...(item.interval ? { recurring: { interval: item.interval } } : {}),
    metadata: { stryv_service: item.service },
  });
  return { price, created: true };
}

async function ensureBillingPortal(priceIdsByService) {
  const subscriptionPriceIds = CATALOG.filter((item) => item.interval).map((item) => priceIdsByService.get(item.service));
  const productsById = new Map();

  for (const priceId of subscriptionPriceIds) {
    const price = await stripe.prices.retrieve(priceId);
    const product = typeof price.product === 'string' ? price.product : price.product.id;
    productsById.set(product, [...(productsById.get(product) ?? []), price.id]);
  }

  const products = Array.from(productsById, ([product, prices]) => ({ product, prices }));
  const features = {
    customer_update: {
      enabled: true,
      allowed_updates: ['name', 'email', 'phone', 'address'],
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: 'at_period_end',
      cancellation_reason: {
        enabled: true,
        options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'],
      },
    },
    subscription_update: {
      enabled: true,
      default_allowed_updates: ['price'],
      proration_behavior: 'create_prorations',
      products,
    },
  };
  const payload = {
    name: 'StryvFit+ Billing Portal',
    default_return_url: `${appOrigin}/book`,
    business_profile: {
      headline: 'Manage your StryvFit+ billing',
      privacy_policy_url: `${publicOrigin}/privacy`,
      terms_of_service_url: `${publicOrigin}/terms`,
    },
    features,
    metadata: {
      stryvfit_portal: 'primary',
      managed_by: 'codex',
    },
  };

  const configurations = await stripe.billingPortal.configurations.list({ limit: 10, active: true });
  const existing = configurations.data.find((item) => item.metadata?.stryvfit_portal === 'primary') ?? configurations.data[0];
  if (existing) {
    const updated = await stripe.billingPortal.configurations.update(existing.id, payload);
    return { configuration: updated, created: false };
  }

  const configuration = await stripe.billingPortal.configurations.create(payload);
  return { configuration, created: true };
}

async function ensureWebhookEvents() {
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpoint = endpoints.data.find((item) => item.url === webhookUrl);
  if (!endpoint) return { endpoint: null, missing: REQUIRED_WEBHOOK_EVENTS };

  const enabled = Array.from(new Set([...endpoint.enabled_events, ...REQUIRED_WEBHOOK_EVENTS])).filter(
    (event) => event !== '*'
  );
  const missing = REQUIRED_WEBHOOK_EVENTS.filter((event) => !endpoint.enabled_events.includes(event));
  if (missing.length === 0 || endpoint.enabled_events.includes('*')) {
    return { endpoint, missing: [] };
  }

  const updated = await stripe.webhookEndpoints.update(endpoint.id, { enabled_events: enabled });
  return { endpoint: updated, missing };
}

async function ensurePaymentMethodPreferences() {
  const configurations = await stripe.paymentMethodConfigurations.list({ limit: 1 });
  const config = configurations.data[0];
  if (!config) return [];

  let current = config;
  for (const method of REQUIRED_PAYMENT_METHODS) {
    if (method.key === 'apple_pay') continue;
    try {
      current = await stripe.paymentMethodConfigurations.update(current.id, {
        [method.key]: { display_preference: { preference: 'on' } },
      });
    } catch {
      // Keep auditing below; some methods require manual approval or are not
      // available for the account region.
    }
  }

  return REQUIRED_PAYMENT_METHODS.map((method) => ({
    ...method,
    available: current[method.key]?.available === true,
    preference: current[method.key]?.display_preference?.preference ?? 'unknown',
  }));
}

async function main() {
  console.log(`\nStripe mode: ${mode}  |  currency: ${currency.toUpperCase()}`);
  console.log('Provisioning StryvFit+ products and prices...\n');

  const envLines = [];
  const priceIdsByService = new Map();

  for (const item of CATALOG) {
    // Reuse a price already configured in .env.local if it still exists & is active.
    const configured = env[item.envVar];
    if (configured && configured.startsWith('price_')) {
      try {
        const existing = await stripe.prices.retrieve(configured);
        if (existing.active) {
          console.log(`${item.service.padEnd(26)} ${`${formatAmount(existing.unit_amount)}`.padEnd(18)} price ${existing.id} (reused from .env.local)`);
          envLines.push(`${item.envVar}=${existing.id}`);
          priceIdsByService.set(item.service, existing.id);
          continue;
        }
      } catch {
        // falls through to create
      }
    }

    const { product, created: productCreated } = await findOrCreateProduct(item);
    const { price, created: priceCreated } = await findOrCreatePrice(item, product.id);

    const billing = item.interval ? `${formatAmount(item.amount)}/${item.interval}` : `${formatAmount(item.amount)} one-time`;
    console.log(
      `${item.service.padEnd(26)} ${billing.padEnd(18)} ` +
        `product ${product.id} (${productCreated ? 'created' : 'reused'}), ` +
        `price ${price.id} (${priceCreated ? 'created' : 'reused'})`
    );
    envLines.push(`${item.envVar}=${price.id}`);
    priceIdsByService.set(item.service, price.id);
  }

  const { configuration, created } = await ensureBillingPortal(priceIdsByService);
  console.log(`\nbilling_portal            configuration ${configuration.id} (${created ? 'created' : 'updated/reused'})`);

  const webhook = await ensureWebhookEvents();
  if (webhook.endpoint) {
    const status = webhook.missing.length === 0 ? 'already covered' : `added ${webhook.missing.join(', ')}`;
    console.log(`stripe_webhook            endpoint ${webhook.endpoint.id} (${status})`);
  } else {
    console.log(`stripe_webhook            missing endpoint ${webhookUrl}`);
    console.log('Create it in Stripe Dashboard, then store the new signing secret as STRIPE_WEBHOOK_SECRET.');
  }

  const paymentMethods = await ensurePaymentMethodPreferences();
  for (const method of paymentMethods) {
    console.log(
      `payment_method            ${method.label.padEnd(13)} available=${method.available} preference=${method.preference}`
    );
    envLines.push(`${method.env}=${method.available ? 'true' : 'false'}`);
  }
  const unavailable = paymentMethods.filter((method) => !method.available);
  if (unavailable.length > 0) {
    console.log(
      `payment_method_attention  Activate/approve in Stripe Dashboard: ${unavailable
        .map((method) => method.label)
        .join(', ')}`
    );
  }

  console.log('\n--- Add these to .env / Cloudflare Worker secrets ---\n');
  console.log(envLines.join('\n'));

  console.log('\n--- Or set them as Cloudflare secrets directly ---\n');
  for (const line of envLines) {
    const [name, value] = line.split('=');
    console.log(`echo "${value}" | bunx wrangler secret put ${name}`);
  }

  console.log('\nDone. Re-running is safe — existing/configured prices are reused.\n');
}

main().catch((error) => {
  console.error('\nProvisioning failed:', error?.message ?? error);
  process.exit(1);
});
