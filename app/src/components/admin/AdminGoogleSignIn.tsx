'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { ADMIN_DASHBOARD_PATH, ADMIN_SIGN_IN_PATH } from '@/lib/routes';

export function AdminGoogleSignIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace(ADMIN_DASHBOARD_PATH);
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <main className="auth-shell bg-bg text-text">
      <section className="auth-panel">
        <div className="mb-8 flex justify-center">
          <BrandWordmark className="w-[230px]" />
        </div>
        <p className="mb-4 text-center font-caption text-[10px] uppercase tracking-[0.18em] text-gold">
          StryvAdmin
        </p>
        <div className="auth-clerk-frame">
          <SignIn
            routing="path"
            path={ADMIN_SIGN_IN_PATH}
            forceRedirectUrl={ADMIN_DASHBOARD_PATH}
            fallbackRedirectUrl={ADMIN_DASHBOARD_PATH}
            appearance={{
              elements: {
                card: 'mx-auto w-full',
                footer: { display: 'none' },
                rootBox: 'mx-auto w-full',
              },
            }}
          />
        </div>
        <p className="mt-4 text-center font-body text-xs text-text-muted">
          Sign in with a Stryv Society Fit email to open StryvAdmin.
        </p>
      </section>
    </main>
  );
}
