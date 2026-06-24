import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { CalendarDays, LogIn } from 'lucide-react';
import { redirect } from 'next/navigation';
import { BrandWordmark } from '@/components/BrandWordmark';
import { InstallAppPrompt } from '@/components/pwa/InstallAppPrompt';
import { getCurrentAppUser, hasBookedFreeFirstSession } from '@/lib/auth';
import {
  destinationForSignedInSignInLanding,
  safeInternalRedirectPath,
  signedInDecisionPath,
} from '@/lib/signInRedirect';
import {
  FIRST_SESSION_BOOKING_PATH,
  FIRST_SESSION_SIGN_UP_PATH,
  MEMBER_SIGN_IN_PATH,
} from '@/lib/routes';

type SignInPageProps = {
  params?: Promise<{ 'sign-in'?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ params, searchParams }: SignInPageProps) {
  const [routeParams, query, appUser] = await Promise.all([params, searchParams, getCurrentAppUser()]);
  const isReturningUserFlow = Boolean(routeParams?.['sign-in']?.length);
  const redirectPath = safeInternalRedirectPath(firstParam(query?.redirect_url));
  const postSignInRedirectPath = signedInDecisionPath(redirectPath);
  const returningHref = `${MEMBER_SIGN_IN_PATH}?redirect_url=${encodeURIComponent(redirectPath)}`;

  if (appUser) {
    const hasFirstSession = appUser.role === 'client' ? await hasBookedFreeFirstSession(appUser) : false;
    redirect(destinationForSignedInSignInLanding(appUser, redirectPath, { hasFirstSession }));
  }

  return (
    <main className="auth-shell bg-bg text-text">
      <section className="auth-panel">
        <div className="mb-8 flex justify-center">
          <BrandWordmark className="w-[230px]" />
        </div>
        {isReturningUserFlow ? (
          <div className="auth-clerk-frame">
            <SignIn
              routing="path"
              path={MEMBER_SIGN_IN_PATH}
              signUpUrl={FIRST_SESSION_SIGN_UP_PATH}
              fallbackRedirectUrl={postSignInRedirectPath}
              forceRedirectUrl={postSignInRedirectPath}
              signUpForceRedirectUrl={FIRST_SESSION_BOOKING_PATH}
              signUpFallbackRedirectUrl={FIRST_SESSION_BOOKING_PATH}
              appearance={{
                elements: {
                  card: 'mx-auto w-full',
                  footer: 'mx-auto',
                  rootBox: 'mx-auto w-full',
                },
              }}
            />
          </div>
        ) : (
          <div className="w-full rounded-md border border-gold/15 bg-surface-2/70 p-5 text-center shadow-glass sm:p-6">
            <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Welcome back</p>
            <h1 className="mt-3 font-section text-3xl leading-none tracking-normal text-text">
              Sign in to your StryvFit account
            </h1>
            <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
              Use your email to manage billing, profile details, and booked sessions. New clients can create an account and claim the first training block.
            </p>
            <div className="mt-5 grid gap-2">
              <Link
                href={returningHref}
                className="ios-pill inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-text-muted"
              >
                <LogIn className="h-4 w-4" strokeWidth={1.8} />
                Sign in with email
              </Link>
              <Link
                href={FIRST_SESSION_SIGN_UP_PATH}
                className="ios-pill inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gold px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-gold-deep"
              >
                <CalendarDays className="h-4 w-4" strokeWidth={1.8} />
                Create Account & Book
              </Link>
            </div>
          </div>
        )}
        <InstallAppPrompt />
      </section>
    </main>
  );
}

function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}
