import { SignUp } from '@clerk/nextjs';
import { BrandWordmark } from '@/components/BrandWordmark';
import { FIRST_SESSION_BOOKING_PATH } from '@/lib/routes';

export default function SignUpPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 py-16 text-text">
      <section className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandWordmark className="w-[230px]" />
        </div>
        <div className="mb-5 rounded-md border border-gold/15 bg-surface-2/70 p-4 text-center shadow-glass">
          <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">First session required</p>
          <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
            After account creation, you will choose your free first session inside StryvFit+.
          </p>
        </div>
        <SignUp
          routing="path"
          path="/sign-up"
          signInUrl="/sign-in"
          forceRedirectUrl={FIRST_SESSION_BOOKING_PATH}
          fallbackRedirectUrl={FIRST_SESSION_BOOKING_PATH}
          signInForceRedirectUrl={FIRST_SESSION_BOOKING_PATH}
          signInFallbackRedirectUrl={FIRST_SESSION_BOOKING_PATH}
          unsafeMetadata={{ onboardingIntent: 'free_first_session' }}
        />
      </section>
    </main>
  );
}
