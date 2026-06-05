import { describe, expect, test } from 'bun:test';
import {
  appCanonicalUrlForRequest,
  adminCanonicalUrlForRequest,
  clerkProxyRequestUrl,
  clerkProxyUrl,
  isBadAppHost,
} from '../src/lib/hosts';

function configuredOrigin(name: string, fallback: string): string {
  return process.env[name]?.trim().replace(/\/$/, '') || fallback;
}

describe('host routing', () => {
  test('routes the admin vanity host to the canonical admin origin', () => {
    const expectedOrigin = configuredOrigin(
      'NEXT_PUBLIC_ADMIN_CANONICAL_URL',
      configuredOrigin('NEXT_PUBLIC_PUBLIC_URL', 'https://stryvsocietyfit.com')
    );

    const url = adminCanonicalUrlForRequest('/admin/pulse', '?panel=appointments');

    expect(url.toString()).toBe(`${expectedOrigin}/admin/pulse?panel=appointments`);
  });

  test('routes unknown admin vanity paths to the dashboard', () => {
    const expectedOrigin = configuredOrigin(
      'NEXT_PUBLIC_ADMIN_CANONICAL_URL',
      configuredOrigin('NEXT_PUBLIC_PUBLIC_URL', 'https://stryvsocietyfit.com')
    );

    const url = adminCanonicalUrlForRequest('/', '');

    expect(url.toString()).toBe(`${expectedOrigin}/admin/pulse`);
  });

  test('canonicalizes Clerk proxy traffic to the configured proxy host', () => {
    const proxy = new URL(clerkProxyUrl());
    const url = clerkProxyRequestUrl('/__clerk/v1/client', '?test=1');

    expect(url.toString()).toBe(`${proxy.origin}/__clerk/v1/client?test=1`);
  });

  test('recovers bad www app install URLs to the canonical app host', () => {
    const expectedOrigin = configuredOrigin('NEXT_PUBLIC_APP_URL', 'https://app.stryvsocietyfit.com');
    const url = appCanonicalUrlForRequest('/admin/pulse', '?from=pwa');

    expect(isBadAppHost('www.app.stryvsocietyfit.com')).toBe(true);
    expect(url.toString()).toBe(`${expectedOrigin}/admin/pulse?from=pwa`);
  });
});
