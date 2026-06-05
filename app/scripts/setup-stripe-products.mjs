#!/usr/bin/env node
/**
 * One-shot Stripe product/price provisioner for StryvFit+.
 *
 * Creates the products and prices the booking flow expects, then prints the
 * NEXT_PUBLIC_STRIPE_PRICE_* values to paste into Cloudflare Worker secrets.
 *
 * Safe to re-run: products are matched by metadata.stryv_service and prices by
 * lookup_key, so a second run reuses existing objects instead of duplicating.
 *
 * Reads STRIPE_SECRET_KEY (and any already-set price IDs) from .env.local, or
 * from the environment. Prices already present in .env.local are reused, so it
 * only creates what is missing (e.g. the online-coaching subscriptions).
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

const secretKey = env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('Missing STRIPE_SECRET_KEY (checked .env.local and environment).');
  process.exit(1);
}

const currency = (env.STRIPE_CURRENCY ?? 'usd').toLowerCase();
const liveMode = secretKey.startsWith('sk_live_');
const stripe = new Stripe(secretKey, { apiVersion: '2026-05-27.dahlia' });

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

async function main() {
  console.log(`\nStripe mode: ${liveMode ? 'LIVE' : 'TEST'}  |  currency: ${currency.toUpperCase()}`);
  console.log('Provisioning StryvFit+ products and prices...\n');

  const envLines = [];

  for (const item of CATALOG) {
    // Reuse a price already configured in .env.local if it still exists & is active.
    const configured = env[item.envVar];
    if (configured && configured.startsWith('price_')) {
      try {
        const existing = await stripe.prices.retrieve(configured);
        if (existing.active) {
          console.log(`${item.service.padEnd(26)} ${`${formatAmount(existing.unit_amount)}`.padEnd(18)} price ${existing.id} (reused from .env.local)`);
          envLines.push(`${item.envVar}=${existing.id}`);
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
