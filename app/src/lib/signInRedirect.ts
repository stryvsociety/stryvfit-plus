import type { AppUser } from '@/lib/auth';
import { isAdminEmail, isAdminRole } from '@/lib/auth';
import { ADMIN_DASHBOARD_PATH, FIRST_SESSION_BOOKING_PATH, RETURNING_MEMBER_BOOKING_PATH } from '@/lib/routes';

type SignInLandingUser = Pick<AppUser, 'email' | 'role'>;

export function safeInternalRedirectPath(value: string | null | undefined, fallback = FIRST_SESSION_BOOKING_PATH): string {
  const requested = value?.trim();
  if (!requested || !requested.startsWith('/') || requested.startsWith('//') || requested.includes('\\')) {
    return fallback;
  }

  return requested;
}

export function signedInDecisionPath(requestedRedirectPath: string): string {
  return `/sign-in?redirect_url=${encodeURIComponent(safeInternalRedirectPath(requestedRedirectPath))}`;
}

export function isFirstSessionBookingPath(path: string): boolean {
  try {
    const url = new URL(path, 'https://stryv.local');
    return (
      url.pathname === '/book' &&
      (url.searchParams.get('service') === 'free' || url.searchParams.get('intent') === 'first-session')
    );
  } catch {
    return path === FIRST_SESSION_BOOKING_PATH;
  }
}

export function destinationForSignedInSignInLanding(
  user: SignInLandingUser,
  requestedRedirectPath: string,
  options: { hasFirstSession: boolean } = { hasFirstSession: false }
): string {
  if (isAdminEmail(user.email) || isAdminRole(user.role)) {
    return ADMIN_DASHBOARD_PATH;
  }

  if (options.hasFirstSession && isFirstSessionBookingPath(requestedRedirectPath)) {
    return RETURNING_MEMBER_BOOKING_PATH;
  }

  return requestedRedirectPath;
}
