import type { AppUser } from '@/lib/auth';
import { isAdminEmail, isAdminRole } from '@/lib/auth';
import { ADMIN_DASHBOARD_PATH } from '@/lib/routes';

type SignInLandingUser = Pick<AppUser, 'email' | 'role'>;

export function destinationForSignedInSignInLanding(user: SignInLandingUser, requestedRedirectPath: string): string {
  if (isAdminEmail(user.email) || isAdminRole(user.role)) {
    return ADMIN_DASHBOARD_PATH;
  }

  return requestedRedirectPath;
}
