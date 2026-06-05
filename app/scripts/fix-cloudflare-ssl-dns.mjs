#!/usr/bin/env node
/**
 * Fix site-down SSL: ensure ACME TXT + book DNS on Ashley's zone.
 * Loads CLOUDFLARE_* from .env.local.
 */
import './load-env-local.mjs';

const ZONE = process.env.CLOUDFLARE_ZONE_ID ?? '22998ccbcc56665c9e7f3ca5315981e7';
const token = process.env.CLOUDFLARE_API_TOKEN;
if (!token) {
  console.error('Set CLOUDFLARE_API_TOKEN in .env.local');
  process.exit(1);
}

const base = `https://api.cloudflare.com/client/v4/zones/${ZONE}`;
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function api(path, init = {}) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...init.headers } });
  const data = await res.json();
  if (!data.success) {
    const dup = data.errors?.some((e) => e.code === 81058);
    if (dup) return { success: true, result: null, duplicate: true };
    throw new Error(JSON.stringify(data.errors ?? data));
  }
  return data;
}

async function ensureTxt(name, content) {
  const listed = await api(`/dns_records?type=TXT&name=${encodeURIComponent(name)}`);
  const exists = listed.result.some((r) => r.content === content);
  if (exists) {
    console.log('TXT ok', content.slice(0, 24) + '…');
    return;
  }
  await api('/dns_records', {
    method: 'POST',
    body: JSON.stringify({ type: 'TXT', name, content, ttl: 1 }),
  });
  console.log('TXT created', content.slice(0, 24) + '…');
}

async function ensureA(name, ip) {
  const listed = await api(`/dns_records?type=A&name=${encodeURIComponent(name)}`);
  const exists = listed.result.some((r) => r.content === ip && r.proxied);
  if (exists) {
    console.log('A ok', name, ip);
    return;
  }
  await api('/dns_records', {
    method: 'POST',
    body: JSON.stringify({ type: 'A', name, content: ip, proxied: true, ttl: 1 }),
  });
  console.log('A created', name, ip);
}

const verification = await api('/ssl/verification?hostname=*.stryvsocietyfit.com');
const pack = verification.result?.[0];
if (pack?.verification_info) {
  for (const v of pack.verification_info) {
    if (v.txt_value) await ensureTxt('_acme-challenge', v.txt_value);
  }
  if (pack.cert_pack_uuid) {
    await api(`/ssl/verification/${pack.cert_pack_uuid}`, {
      method: 'PATCH',
      body: JSON.stringify({ validation_method: 'txt' }),
    });
    console.log('Triggered cert re-validation for', pack.hostname);
  }
}

for (const sub of ['book', 'admin']) {
  for (const ip of ['104.21.93.55', '172.67.205.145']) {
    await ensureA(sub, ip);
  }
}

const packs = await api('/ssl/certificate_packs?status=all');
for (const p of packs.result) {
  console.log('cert pack', p.type, p.status, p.hosts?.join(', '));
}

console.log('\nIf universal is still pending_validation, open Cloudflare → SSL/TLS → Edge Certificates → disable then re-enable Universal SSL (takes ~5 min).');
