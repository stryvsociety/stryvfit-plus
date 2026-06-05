#!/usr/bin/env node
/**
 * Read-only audit of the connected Stripe account.
 * Loads STRIPE_SECRET_KEY from .env.local (or env), lists active products/prices,
 * and reports which StryvFit+ price env vars are satisfied vs missing.
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

const env = { ...loadEnvLocal(), ...process.env };
const secretKey = env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('No STRIPE_SECRET_KEY found in .env.local or environment.');
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: '2026-05-27.dahlia' });
const mode = secretKey.startsWith('sk_live_') ? 'LIVE' : 'TEST';

const REQUIRED = [
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4', label: '4 sessions', type: 'one-time' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_8', label: '8 sessions', type: 'one-time' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_12', label: '12 sessions', type: 'one-time' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_STARTER', label: 'Online Starter', type: 'subscription' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELEVATE', label: 'Online Elevate', type: 'subscription' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELITE', label: 'Online Elite', type: 'subscription' },
];

function fmt(price) {
  if (!price) return 'n/a';
  const amt = price.unit_amount != null ? `$${(price.unit_amount / 100).toFixed(2)}` : '(custom)';
  const rec = price.recurring ? `/${price.recurring.interval}` : ' one-time';
  return `${amt}${rec}`;
}

async function main() {
  console.log(`\nStripe account mode: ${mode}\n`);
  console.log('=== All active prices in account ===');
  const prices = await stripe.prices.list({ active: true, limit: 100, expand: ['data.product'] });
  if (prices.data.length === 0) console.log('(none)');
  for (const p of prices.data) {
    const productName = typeof p.product === 'object' && p.product ? p.product.name : p.product;
    console.log(`  ${p.id}  ${fmt(p).padEnd(14)}  ${productName ?? ''}`);
  }

  console.log('\n=== Required StryvFit+ prices ===');
  const missing = [];
  for (const req of REQUIRED) {
    const configured = env[req.env];
    let status = '';
    if (configured && configured.startsWith('price_')) {
      try {
        const p = await stripe.prices.retrieve(configured);
        status = p.active ? `OK  ${configured}  (${fmt(p)})` : `INACTIVE ${configured}`;
        if (!p.active) missing.push(req);
      } catch {
        status = `BROKEN (id in env not found in this account: ${configured})`;
        missing.push(req);
      }
    } else {
      status = 'MISSING (no env value)';
      missing.push(req);
    }
    console.log(`  ${req.label.padEnd(16)} ${req.type.padEnd(13)} -> ${status}`);
  }

  console.log('\n=== Summary ===');
  if (missing.length === 0) {
    console.log('All required prices are present and active. Nothing to create.');
  } else {
    console.log(`Missing/needs-creation: ${missing.map((m) => m.label).join(', ')}`);
  }
  console.log('');
}

main().catch((e) => {
  console.error('Audit failed:', e?.message ?? e);
  process.exit(1);
});
