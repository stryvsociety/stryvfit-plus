#!/usr/bin/env node
/**
 * Upload secrets from .cloudflare-redeploy.env (or .env.local) to the Worker.
 * Requires CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID in .env.local.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import './load-env-local.mjs';

const appDir = path.resolve(import.meta.dirname, '..');
process.chdir(appDir);

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const i = line.indexOf('=');
    if (i === -1) continue;
    const key = line.slice(0, i).trim();
    const value = line.slice(i + 1).trim();
    if (value) out[key] = value;
  }
  return out;
}

const local = loadEnvFile('.env.local');
const redeploy = loadEnvFile('.cloudflare-redeploy.env');
const env = { ...redeploy, ...local };

if (!env.CLOUDFLARE_API_TOKEN) {
  console.error('Missing CLOUDFLARE_API_TOKEN in .env.local');
  process.exit(1);
}

const skip = new Set(['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID']);
/** Plaintext in wrangler.jsonc `vars` — must not also be Worker secrets (API error 10053). */
const wranglerVars = new Set([
  'NEXT_PUBLIC_APP_URL',
  'NEXT_PUBLIC_CLERK_PROXY_URL',
  'NEXT_PUBLIC_CAL_ORIGIN',
  'NEXT_PUBLIC_CAL_USERNAME',
  'NEXT_PUBLIC_CAL_EVENT_FREE',
  'NEXT_PUBLIC_CAL_EVENT_COACHING',
  'NEXT_PUBLIC_CAL_EVENT_PREMIUM',
  'NEXT_PUBLIC_CAL_EVENT_MEAL_PREP',
  'WGER_API_BASE_URL',
]);
const keys = Object.keys(env).filter(
  (k) => !skip.has(k) && !wranglerVars.has(k) && !k.startsWith('INCIDENT_SYNC')
);

const wranglerEnv = {
  ...process.env,
  CLOUDFLARE_API_TOKEN: env.CLOUDFLARE_API_TOKEN,
  CLOUDFLARE_ACCOUNT_ID: env.CLOUDFLARE_ACCOUNT_ID ?? '',
};

let ok = 0;
let fail = 0;

for (const key of keys) {
  const value = env[key];
  if (!value) {
    console.log(`skip (empty) ${key}`);
    continue;
  }
  const result = spawnSync('bunx', ['wrangler', 'secret', 'put', key], {
    input: value,
    env: wranglerEnv,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  if (result.status === 0) {
    console.log(`ok ${key}`);
    ok++;
  } else {
    console.error(`fail ${key}`, result.stderr?.toString() || result.stdout?.toString());
    fail++;
  }
}

console.log(`\nDone: ${ok} secrets set, ${fail} failed, ${keys.length - ok - fail} skipped empty`);
process.exit(fail > 0 ? 1 : 0);
