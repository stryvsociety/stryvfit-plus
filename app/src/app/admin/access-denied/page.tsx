'use client';

import { useClerk } from '@clerk/nextjs';
import Link from 'next/link';

export default function AdminAccessDeniedPage() {
  const { signOut } = useClerk();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-6 text-text">
      <section className="max-w-md text-center">
        <h1 className="font-section text-3xl tracking-normal">Access denied</h1>
        <p className="mt-4 font-body text-sm leading-relaxed text-text-muted">
          This Google account is not authorized for StryvAdmin. Sign in with the trainer email on file.
        </p>
        <button
          type="button"
          onClick={() => void signOut({ redirectUrl: '/sign-in-admin' })}
          className="ios-pill mt-6 inline-flex min-h-12 items-center justify-center rounded-full bg-gold px-6 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg"
        >
          Sign out & try again
        </button>
        <p className="mt-4">
          <Link href="https://app.stryvsocietyfit.com/book" className="font-body text-sm text-gold underline">
            Client app
          </Link>
        </p>
      </section>
    </main>
  );
}
