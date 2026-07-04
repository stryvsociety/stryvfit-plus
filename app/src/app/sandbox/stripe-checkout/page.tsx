import Link from 'next/link';
import { ArrowLeft, LockKeyhole, ShieldCheck } from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';

export default function SandboxStripeCheckoutPage() {
  return (
    <main className="min-h-dvh bg-bg px-4 py-5 text-text">
      <section className="mx-auto flex min-h-[calc(100dvh-2.5rem)] w-full max-w-md flex-col rounded-md border border-gold/15 bg-surface p-5 shadow-glass-lg">
        <header className="flex items-center justify-between gap-4">
          <BrandWordmark className="w-[160px]" />
          <span className="rounded-md border border-border bg-bg/55 px-2.5 py-1.5 font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">
            Sandbox
          </span>
        </header>

        <div className="mt-10 flex flex-1 flex-col justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-md border border-gold/35 bg-gold/10 text-gold">
            <LockKeyhole className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <p className="mt-6 font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Stripe Checkout</p>
          <h1 className="mt-2 font-section text-5xl leading-none tracking-normal">Payment link opened</h1>
          <p className="mt-4 font-body text-sm leading-relaxed text-text-muted">
            This sandbox page stands in for the hosted Stripe Checkout session. Reaching it confirms the booking CTA fired a real
            navigation after terms were accepted.
          </p>

          <div className="mt-6 rounded-md border border-border bg-bg/45 p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" strokeWidth={1.8} />
              <div>
                <p className="font-control text-sm font-semibold">Mock checkout session ready</p>
                <p className="mt-1 font-body text-xs leading-relaxed text-text-dim">
                  Production uses the Stripe-hosted URL returned by the checkout API.
                </p>
              </div>
            </div>
          </div>
        </div>

        <Link
          href="/sandbox/first-session-booking"
          className="ios-pill mt-8 inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-text-muted transition hover:border-gold/55 hover:text-gold"
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
          Back to sandbox
        </Link>
      </section>
    </main>
  );
}
