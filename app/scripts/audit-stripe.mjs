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
const secretKey = env.STRIPE_ADMIN_SECRET_KEY || env.STRIPE_SECRET_KEY;
if (!secretKey) {
  console.error('No STRIPE_ADMIN_SECRET_KEY or STRIPE_SECRET_KEY found in .env.local or environment.');
  process.exit(1);
}

const stripe = new Stripe(secretKey, { apiVersion: '2026-05-27.dahlia' });
const mode = secretKey.includes('_live_') ? 'LIVE' : secretKey.includes('_test_') ? 'TEST' : 'UNKNOWN';
const webhookUrl = `${(env.NEXT_PUBLIC_APP_URL ?? 'https://app.stryvsocietyfit.com').replace(/\/$/, '')}/api/stripe/webhook`;

const REQUIRED = [
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4', label: '4 sessions', type: 'one-time' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_8', label: '8 sessions', type: 'one-time' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_12', label: '12 sessions', type: 'one-time' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_STARTER', label: 'Online Starter', type: 'subscription' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELEVATE', label: 'Online Elevate', type: 'subscription' },
  { env: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELITE', label: 'Online Elite', type: 'subscription' },
];

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

function fmt(price) {
  if (!price) return 'n/a';
  const amt = price.unit_amount != null ? `$${(price.unit_amount / 100).toFixed(2)}` : '(custom)';
  const rec = price.recurring ? `/${price.recurring.interval}` : ' one-time';
  return `${amt}${rec}`;
}

function envBoolean(name) {
  const value = env[name]?.trim().toLowerCase();
  if (!value) return null;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return null;
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

  console.log('\n=== Billing portal ===');
  const configurations = await stripe.billingPortal.configurations.list({ limit: 10, active: true });
  if (configurations.data.length === 0) {
    console.log('  MISSING (no active billing portal configuration)');
    missing.push({ label: 'Billing portal configuration' });
  } else {
    for (const config of configurations.data) {
      const managed = config.metadata?.stryvfit_portal === 'primary' ? 'primary' : 'active';
      console.log(
        `  OK  ${config.id}  ${managed}  payment_method_update=${config.features.payment_method_update.enabled}  subscription_cancel=${config.features.subscription_cancel.enabled}  subscription_update=${config.features.subscription_update.enabled}`
      );
    }
  }

  console.log('\n=== Stripe webhook endpoint ===');
  const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
  const endpoint = endpoints.data.find((item) => item.url === webhookUrl);
  if (!endpoint) {
    console.log(`  MISSING (${webhookUrl})`);
    missing.push({ label: 'Stripe webhook endpoint' });
  } else {
    console.log(`  OK  ${endpoint.id}  ${endpoint.status}  ${endpoint.url}`);
    for (const event of REQUIRED_WEBHOOK_EVENTS) {
      const ok = endpoint.enabled_events.includes('*') || endpoint.enabled_events.includes(event);
      console.log(`    ${ok ? 'OK     ' : 'MISSING'} ${event}`);
      if (!ok) missing.push({ label: `Webhook event ${event}` });
    }
  }

  console.log('\n=== Payment method availability ===');
  const livePaymentMethods = new Map();
  try {
    const paymentMethodConfigurations = await stripe.paymentMethodConfigurations.list({ limit: 1 });
    const config = paymentMethodConfigurations.data[0];
    if (!config) {
      console.log('  MISSING (no payment method configuration)');
      missing.push({ label: 'Payment method configuration' });
    } else {
      for (const method of REQUIRED_PAYMENT_METHODS) {
        const state = config[method.key];
        const available = state?.available === true;
        const preference = state?.display_preference?.preference ?? 'unknown';
        livePaymentMethods.set(method.key, { available, preference });
        console.log(`  ${available ? 'OK     ' : 'MISSING'} ${method.label}  available=${available}  preference=${preference}`);
        if (!available) missing.push({ label: `${method.label} activation` });
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(`  MISSING (unable to read payment method configuration: ${message})`);
    missing.push({ label: 'Payment method configuration read' });
  }

  console.log('\n=== Configured client payment-method display ===');
  for (const method of REQUIRED_PAYMENT_METHODS) {
    const configured = envBoolean(method.env);
    const live = livePaymentMethods.get(method.key);
    const configuredLabel = configured == null ? 'MISSING' : String(configured);
    const liveLabel = live ? String(live.available) : 'unknown';
    console.log(`  ${configured == null ? 'MISSING' : 'OK     '} ${method.env.padEnd(30)} configured=${configuredLabel}  stripe_available=${liveLabel}`);
    if (configured == null) {
      missing.push({ label: `${method.env} env` });
      continue;
    }
    if (live && configured !== live.available) {
      missing.push({
        label: `${method.label} client config (${method.env}=${configured}) does not match Stripe availability (${live.available})`,
      });
    }
  }

  console.log('\n=== Billing notice email provider ===');
  if (env.RESEND_API_KEY) {
    console.log('  OK      RESEND_API_KEY configured');
  } else {
    console.log('  MISSING RESEND_API_KEY');
    missing.push({ label: 'Resend API key' });
  }
  if (env.BILLING_NOTICE_FROM_EMAIL) {
    console.log(`  OK      BILLING_NOTICE_FROM_EMAIL=${env.BILLING_NOTICE_FROM_EMAIL}`);
  } else {
    console.log('  MISSING BILLING_NOTICE_FROM_EMAIL');
    missing.push({ label: 'Billing notice sender email' });
  }
  console.log(`  ${env.BILLING_NOTICE_REPLY_TO ? 'OK     ' : 'OPTION '} BILLING_NOTICE_REPLY_TO=${env.BILLING_NOTICE_REPLY_TO || '(defaults to ashley@stryvsocietyfit.com)'}`);

  console.log('\n=== Summary ===');
  if (missing.length === 0) {
    console.log('All required prices, portal settings, webhook events, payment-method config, and email provider settings are present.');
  } else {
    console.log(`Missing/needs-attention: ${missing.map((m) => m.label).join(', ')}`);
  }
  console.log('');
}

main().catch((e) => {
  console.error('Audit failed:', e?.message ?? e);
  process.exit(1);
});
