import { afterEach, describe, expect, test } from 'bun:test';
import { isAdminEmail, isAdminRole } from '../src/lib/auth';
import {
  destinationForSignedInSignInLanding,
  safeInternalRedirectPath,
  signedInDecisionPath,
} from '../src/lib/signInRedirect';
import { FIRST_SESSION_BOOKING_PATH, RETURNING_MEMBER_BOOKING_PATH } from '../src/lib/routes';

const originalAdminEmails = process.env.ADMIN_EMAILS;
const originalPublicAdminEmails = process.env.NEXT_PUBLIC_ADMIN_EMAILS;

afterEach(() => {
  restoreEnv('ADMIN_EMAILS', originalAdminEmails);
  restoreEnv('NEXT_PUBLIC_ADMIN_EMAILS', originalPublicAdminEmails);
});

describe('admin auth helpers', () => {
  test('treats every Stryv Society Fit email as admin-capable', () => {
    process.env.ADMIN_EMAILS = '';
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = '';

    expect(isAdminEmail('ashley@stryvsocietyfit.com')).toBe(true);
    expect(isAdminEmail('COACH@STRYVSOCIETYFIT.COM')).toBe(true);
    expect(isAdminEmail('client@example.com')).toBe(false);
  });

  test('keeps explicit admin email allowlist support', () => {
    process.env.ADMIN_EMAILS = 'owner@example.com';
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = '';

    expect(isAdminEmail('OWNER@example.com')).toBe(true);
    expect(isAdminEmail('member@example.com')).toBe(false);
  });

  test('recognizes non-client staff roles', () => {
    expect(isAdminRole('admin')).toBe(true);
    expect(isAdminRole('trainer')).toBe(true);
    expect(isAdminRole('support')).toBe(true);
    expect(isAdminRole('client')).toBe(false);
  });

  test('sends signed-in Stryv Society Fit emails from the greeting page to admin', () => {
    process.env.ADMIN_EMAILS = '';
    process.env.NEXT_PUBLIC_ADMIN_EMAILS = '';

    expect(
      destinationForSignedInSignInLanding(
        { email: 'newcoach@stryvsocietyfit.com', role: 'admin' },
        FIRST_SESSION_BOOKING_PATH
      )
    ).toBe('/admin/pulse');
    expect(
      destinationForSignedInSignInLanding(
        { email: 'client@example.com', role: 'client' },
        FIRST_SESSION_BOOKING_PATH
      )
    ).toBe(FIRST_SESSION_BOOKING_PATH);
  });

  test('sends returning clients away from the first-session booking path', () => {
    expect(
      destinationForSignedInSignInLanding(
        { email: 'client@example.com', role: 'client' },
        FIRST_SESSION_BOOKING_PATH,
        { hasFirstSession: true }
      )
    ).toBe(RETURNING_MEMBER_BOOKING_PATH);

    expect(
      destinationForSignedInSignInLanding(
        { email: 'client@example.com', role: 'client' },
        '/book?service=sessions_8',
        { hasFirstSession: true }
      )
    ).toBe('/book?service=sessions_8');
  });

  test('keeps post-auth redirects inside the app', () => {
    expect(safeInternalRedirectPath('https://bad.example/session')).toBe(FIRST_SESSION_BOOKING_PATH);
    expect(safeInternalRedirectPath('//bad.example/session')).toBe(FIRST_SESSION_BOOKING_PATH);
    expect(safeInternalRedirectPath('/book?service=sessions_4')).toBe('/book?service=sessions_4');
    expect(signedInDecisionPath('/book?service=sessions_4')).toBe(
      '/sign-in?redirect_url=%2Fbook%3Fservice%3Dsessions_4'
    );
  });
});

function restoreEnv(name: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[name];
    return;
  }

  process.env[name] = value;
}
