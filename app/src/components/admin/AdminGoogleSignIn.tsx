'use client';

import { SignIn, useAuth } from '@clerk/nextjs';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { ADMIN_SIGN_IN_PATH } from '@/lib/routes';

export function AdminGoogleSignIn() {
  const { isLoaded, isSignedIn } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoaded && isSignedIn) {
      router.replace('/admin/pulse');
    }
  }, [isLoaded, isSignedIn, router]);

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 py-16 text-text">
      <section className="w-full max-w-md">
        <div className="mb-8 flex justify-center">
          <BrandWordmark className="w-[230px]" />
        </div>
        <p className="mb-4 text-center font-caption text-[10px] uppercase tracking-[0.18em] text-gold">
          StryvAdmin
        </p>
        <SignIn
          routing="path"
          path={ADMIN_SIGN_IN_PATH}
          forceRedirectUrl="/admin/pulse"
          fallbackRedirectUrl="/admin/pulse"
          appearance={{
            elements: {
              footer: { display: 'none' },
            },
          }}
        />
        <p className="mt-4 text-center font-body text-xs text-text-muted">
          Sign in with Google. Only emails in ADMIN_EMAILS can open StryvAdmin.
        </p>
      </section>
    </main>
  );
}
