import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter';

export default function TermsPage() {
  return (
    <main className="min-h-dvh bg-bg px-6 py-20 text-text">
      <section className="mx-auto max-w-3xl">
        <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Terms</p>
        <h1 className="mt-4 font-section text-5xl leading-none tracking-normal">Terms of Use</h1>
        <p className="mt-4 font-caption text-[10px] uppercase tracking-[0.14em] text-text-dim">
          Last updated May 30, 2026
        </p>

        <div className="mt-8 space-y-6 font-body text-sm leading-relaxed text-text-muted">
          <section>
            <h2 className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Use of StryvFit+</h2>
            <p className="mt-3">
              StryvFit+ provides booking, coaching, training, nutrition, and client communication tools for Stryv
              Society Fitness clients. By using the site or PWA, you agree to use it only for lawful, account-related,
              and coaching-related purposes.
            </p>
          </section>

          <section>
            <h2 className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Accounts and bookings</h2>
            <p className="mt-3">
              You are responsible for keeping your account information accurate and secure. New clients may be required
              to book a free first session before accessing the full client experience or purchasing a package.
            </p>
          </section>

          <section>
            <h2 className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Payments</h2>
            <p className="mt-3">
              Paid packages and subscriptions are processed through Stripe. StryvFit+ does not store payment card
              details. Prices, package availability, and subscription terms may change, but confirmed purchases remain
              subject to the terms shown at checkout.
            </p>
          </section>

          <section>
            <h2 className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Training responsibility</h2>
            <p className="mt-3">
              Coaching and training guidance is educational and fitness-oriented. It is not medical advice. You are
              responsible for telling your coach about injuries, restrictions, or medical concerns before training and
              for stopping activity if something feels unsafe.
            </p>
          </section>

          <section>
            <h2 className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Acceptable use</h2>
            <p className="mt-3">
              Do not misuse the platform, attempt unauthorized access, interfere with service operations, scrape private
              client information, or upload content that is unlawful, harmful, or unrelated to your coaching relationship.
            </p>
          </section>

          <section>
            <h2 className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Changes and contact</h2>
            <p className="mt-3">
              These terms may be updated as the service changes. Continued use of StryvFit+ after changes means you
              accept the updated terms. For questions, contact{' '}
              <a className="text-gold" href="mailto:ashley@stryvsocietyfit.com">
                ashley@stryvsocietyfit.com
              </a>
              .
            </p>
          </section>
        </div>

        <PublicLegalFooter />
      </section>
    </main>
  );
}
