import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { CalendarDays, LogIn } from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { InstallAppPrompt } from '@/components/pwa/InstallAppPrompt';
import { FIRST_SESSION_BOOKING_PATH, FIRST_SESSION_SIGN_UP_PATH, MEMBER_SIGN_IN_PATH } from '@/lib/routes';

type SignInPageProps = {
  params?: Promise<{ 'sign-in'?: string[] }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SignInPage({ params, searchParams }: SignInPageProps) {
  const routeParams = await params;
  const query = await searchParams;
  const isReturningUserFlow = Boolean(routeParams?.['sign-in']?.length);
  const redirectPath = firstParam(query?.redirect_url) ?? FIRST_SESSION_BOOKING_PATH;
  const returningHref = `${MEMBER_SIGN_IN_PATH}?redirect_url=${encodeURIComponent(redirectPath)}`;

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
              fallbackRedirectUrl={redirectPath}
              forceRedirectUrl={redirectPath}
              signUpForceRedirectUrl={FIRST_SESSION_BOOKING_PATH}
              signUpFallbackRedirectUrl={FIRST_SESSION_BOOKING_PATH}
            />
          </div>
        ) : (
          <div className="w-full rounded-md border border-gold/15 bg-surface-2/70 p-5 text-left shadow-glass sm:p-6">
            <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Welcome back?</p>
            <h1 className="mt-3 font-section text-3xl leading-none tracking-normal text-text">
              Sign in or start your first session
            </h1>
            <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
              Returning members can sign in. New members can create an account and book the first training block at no cost.
            </p>
            <div className="mt-5 grid gap-2">
              <Link
                href={returningHref}
                className="ios-pill inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-white px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-text-muted"
              >
                <LogIn className="h-4 w-4" strokeWidth={1.8} />
                Sign In
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
