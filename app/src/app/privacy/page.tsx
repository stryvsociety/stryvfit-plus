import { PublicLegalFooter } from '@/components/legal/PublicLegalFooter';

export default function PrivacyPage() {
  return (
    <main className="min-h-dvh bg-bg px-6 py-20 text-text">
      <section className="mx-auto max-w-3xl">
        <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Privacy</p>
        <h1 className="mt-4 font-section text-5xl leading-none tracking-normal">Privacy Policy</h1>
        <p className="mt-4 font-caption text-[10px] uppercase tracking-[0.14em] text-text-dim">
          Last updated May 30, 2026
        </p>
        <div className="mt-8 space-y-5 font-body text-sm leading-relaxed text-text-muted">
          <p>
            StryvFit+ collects account, booking, payment, and training information needed to schedule sessions,
            manage client progress, and operate the coaching platform.
          </p>
          <p>
            Authentication is handled through Clerk, payments through Stripe, and scheduling through Google Calendar.
            Payment card details are processed by Stripe and are not stored by StryvFit+.
          </p>
          <p>
            Client training notes, bookings, and support requests are used to provide coaching services and operational
            support. Access is limited to the client, authorized trainer/admin users, and Solvys support where needed.
          </p>
          <p>
            For privacy or account requests, contact <a className="text-gold" href="mailto:ashley@stryvsocietyfit.com">ashley@stryvsocietyfit.com</a>.
          </p>
        </div>
        <PublicLegalFooter />
      </section>
    </main>
  );
}
