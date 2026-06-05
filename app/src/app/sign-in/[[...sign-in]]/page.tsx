import { SignIn } from '@clerk/nextjs';
import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { InstallAppPrompt } from '@/components/pwa/InstallAppPrompt';
import { FIRST_SESSION_BOOKING_PATH, FIRST_SESSION_SIGN_UP_PATH } from '@/lib/routes';

export default function SignInPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 py-16 text-text">
      <section className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandWordmark className="w-[230px]" />
        </div>
        <SignIn
          routing="path"
          path="/sign-in"
          signUpUrl={FIRST_SESSION_SIGN_UP_PATH}
          fallbackRedirectUrl={FIRST_SESSION_BOOKING_PATH}
          signUpForceRedirectUrl={FIRST_SESSION_BOOKING_PATH}
          signUpFallbackRedirectUrl={FIRST_SESSION_BOOKING_PATH}
        />
        <div className="mt-5 rounded-md border border-gold/15 bg-surface-2/70 p-4 text-center shadow-glass">
          <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">No account yet?</p>
          <h1 className="mt-3 font-section text-3xl leading-none tracking-normal text-text">
            Book your free first session
          </h1>
          <p className="mx-auto mt-3 max-w-xs font-body text-sm leading-relaxed text-text-muted">
            Create your StryvFit+ account, then choose the first training block at no cost.
          </p>
          <Link
            href={FIRST_SESSION_SIGN_UP_PATH}
            className="ios-pill mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gold px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-gold-deep"
          >
            <CalendarDays className="h-4 w-4" strokeWidth={1.8} />
            Create Account & Book
          </Link>
        </div>
        <InstallAppPrompt />
      </section>
    </main>
  );
}
