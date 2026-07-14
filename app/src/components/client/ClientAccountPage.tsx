'use client';

import { type FormEvent, useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { CalendarX2, CreditCard, ExternalLink, LockKeyhole, Save, UserRound } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import type { ClientBookingSummary } from '@/lib/bookings';
import {
  BOOKING_SERVICES,
  MEMBERSHIP_INVOICE_SERVICE_TYPES,
  type MembershipInvoiceServiceType,
} from '@/lib/bookingServices';

type ClientProfileState = {
  email: string;
  fullName: string | null;
  phone: string | null;
  profileGoal: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
};

function valueOrEmpty(value: string | null): string {
  return value ?? '';
}

function formatSessionDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Scheduled session';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export function ClientAccountPage({
  initialBookings,
  initialProfile,
}: {
  initialBookings: ClientBookingSummary[];
  initialProfile: ClientProfileState;
}) {
  const { openUserProfile } = useClerk();
  const [profile, setProfile] = useState({
    fullName: valueOrEmpty(initialProfile.fullName),
    phone: valueOrEmpty(initialProfile.phone),
    profileGoal: valueOrEmpty(initialProfile.profileGoal),
    emergencyContactName: valueOrEmpty(initialProfile.emergencyContactName),
    emergencyContactPhone: valueOrEmpty(initialProfile.emergencyContactPhone),
  });
  const [bookings, setBookings] = useState(initialBookings);
  const [savingProfile, setSavingProfile] = useState(false);
  const [invoiceBusy, setInvoiceBusy] = useState(false);
  const [membershipServiceType, setMembershipServiceType] = useState<MembershipInvoiceServiceType | ''>('');
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateProfileField(field: keyof typeof profile, value: string) {
    setProfile((current) => ({ ...current, [field]: value }));
    setError(null);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingProfile) return;

    setSavingProfile(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch('/api/client/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(profile),
      });
      const payload = (await response.json().catch(() => null)) as {
        profile?: {
          fullName: string | null;
          phone: string | null;
          profileGoal: string | null;
          emergencyContactName: string | null;
          emergencyContactPhone: string | null;
        };
        error?: string;
      } | null;
      if (!response.ok || !payload?.profile) {
        throw new Error(payload?.error ?? 'Unable to save profile');
      }

      setProfile({
        fullName: valueOrEmpty(payload.profile.fullName),
        phone: valueOrEmpty(payload.profile.phone),
        profileGoal: valueOrEmpty(payload.profile.profileGoal),
        emergencyContactName: valueOrEmpty(payload.profile.emergencyContactName),
        emergencyContactPhone: valueOrEmpty(payload.profile.emergencyContactPhone),
      });
      setNotice('Profile saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save profile');
    } finally {
      setSavingProfile(false);
    }
  }

  async function openMembershipInvoice() {
    if (invoiceBusy || !membershipServiceType) return;

    setInvoiceBusy(true);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch('/api/billing/membership-invoice', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ serviceType: membershipServiceType }),
      });
      const payload = (await response.json().catch(() => null)) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error ?? 'Unable to prepare membership billing.');
      }

      window.location.assign(payload.url);
    } catch (billingError) {
      setError(billingError instanceof Error ? billingError.message : 'Unable to prepare membership billing.');
    } finally {
      setInvoiceBusy(false);
    }
  }

  async function cancelBooking(booking: ClientBookingSummary) {
    if (cancelingBookingId || !booking.canCancel) return;

    setCancelingBookingId(booking.id);
    setNotice(null);
    setError(null);
    try {
      const response = await fetch(`/api/client/bookings/${booking.id}`, { method: 'DELETE' });
      const payload = (await response.json().catch(() => null)) as {
        lateCourtesyUsed?: boolean;
        error?: string;
      } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to cancel session');

      setBookings((current) => current.filter((item) => item.id !== booking.id));
      setNotice(
        payload?.lateCourtesyUsed
          ? 'Session canceled. Your one late-cancel courtesy has been used.'
          : 'Session canceled.'
      );
    } catch (cancelError) {
      setError(cancelError instanceof Error ? cancelError.message : 'Unable to cancel session');
    } finally {
      setCancelingBookingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <header className="mb-6">
        <p className="font-caption text-[11px] uppercase tracking-[0.18em] text-gold">Account</p>
        <h1 className="mt-2 font-section text-3xl tracking-normal text-text">PROFILE & BILLING</h1>
        <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
          Manage your contact info, billing, password, and upcoming StryvFit sessions.
        </p>
      </header>

      {notice ? (
        <p className="mb-4 rounded-md border border-gold/25 bg-gold/10 p-3 font-body text-sm text-text" aria-live="polite">
          {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mb-4 rounded-md border border-red-500/35 bg-red-500/10 p-3 font-body text-sm text-red-100" aria-live="polite">
          {error}
        </p>
      ) : null}

      <div className="space-y-4">
        <Card>
          <div className="mb-4 flex items-center gap-2">
            <UserRound className="h-5 w-5 text-gold" strokeWidth={1.7} />
            <h2 className="font-section text-2xl tracking-normal text-text">Profile</h2>
          </div>
          <form className="grid gap-3" onSubmit={saveProfile}>
            <label className="block">
              <span className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">Name</span>
              <Input
                value={profile.fullName}
                onChange={(event) => updateProfileField('fullName', event.target.value)}
                autoComplete="name"
              />
            </label>
            <label className="block">
              <span className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">Mobile</span>
              <Input
                value={profile.phone}
                onChange={(event) => updateProfileField('phone', event.target.value)}
                autoComplete="tel"
                inputMode="tel"
              />
            </label>
            <label className="block">
              <span className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">Training goal</span>
              <Input
                value={profile.profileGoal}
                onChange={(event) => updateProfileField('profileGoal', event.target.value)}
                placeholder="Strength, fat loss, mobility, conditioning..."
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">
                  Emergency contact
                </span>
                <Input
                  value={profile.emergencyContactName}
                  onChange={(event) => updateProfileField('emergencyContactName', event.target.value)}
                  autoComplete="name"
                />
              </label>
              <label className="block">
                <span className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">
                  Emergency phone
                </span>
                <Input
                  value={profile.emergencyContactPhone}
                  onChange={(event) => updateProfileField('emergencyContactPhone', event.target.value)}
                  autoComplete="tel"
                  inputMode="tel"
                />
              </label>
            </div>
            <Button type="submit" variant="gold" disabled={savingProfile} className="mt-1 inline-flex items-center justify-center gap-2">
              <Save className="h-4 w-4" strokeWidth={1.8} />
              {savingProfile ? 'Saving' : 'Save Profile'}
            </Button>
          </form>
        </Card>

        <Card id="membership-billing">
          <div className="mb-4 flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-gold" strokeWidth={1.7} />
            <h2 className="font-section text-2xl tracking-normal text-text">Membership billing</h2>
          </div>
          <p className="font-body text-sm leading-relaxed text-text-muted">
            Choose the in-person package your coach confirmed. Stripe opens a secure invoice; payment details never pass through StryvFit.
          </p>
          <label className="mt-4 block">
            <span className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">Membership package</span>
            <select
              value={membershipServiceType}
              onChange={(event) => setMembershipServiceType(event.target.value as MembershipInvoiceServiceType | '')}
              className="mt-2 min-h-12 w-full rounded-md border border-border bg-surface-2 px-3 font-body text-sm text-text outline-none transition focus:border-gold"
            >
              <option value="">Choose a package</option>
              {MEMBERSHIP_INVOICE_SERVICE_TYPES.map((serviceType) => (
                <option key={serviceType} value={serviceType}>
                  {BOOKING_SERVICES[serviceType].label}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="gold"
            disabled={invoiceBusy || !membershipServiceType}
            onClick={() => void openMembershipInvoice()}
            className="mt-4 inline-flex w-full items-center justify-center gap-2"
          >
            <ExternalLink className="h-4 w-4" strokeWidth={1.8} />
            {invoiceBusy ? 'Opening Stripe' : 'Open secure Stripe invoice'}
          </Button>
          <p className="mt-3 font-body text-xs leading-relaxed text-text-muted">
            Stripe keeps the invoice payable for seven days. If one is already open, this CTA safely reopens it instead of creating another charge.
          </p>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <LockKeyhole className="h-5 w-5 text-gold" strokeWidth={1.7} />
            <h2 className="font-section text-2xl tracking-normal text-text">Sign-in</h2>
          </div>
          <div className="rounded-md border border-border bg-surface-2 p-3">
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">Email</p>
            <p className="mt-1 break-words font-body text-sm text-text">{initialProfile.email}</p>
          </div>
          <div className="mt-3">
            <Button
              type="button"
              variant="secondary"
              onClick={() => openUserProfile()}
              className="inline-flex items-center justify-center gap-2"
            >
              <LockKeyhole className="h-4 w-4" strokeWidth={1.8} />
              Email & Password
            </Button>
          </div>
        </Card>

        <Card>
          <div className="mb-4 flex items-center gap-2">
            <CalendarX2 className="h-5 w-5 text-gold" strokeWidth={1.7} />
            <h2 className="font-section text-2xl tracking-normal text-text">Upcoming sessions</h2>
          </div>
          {bookings.length === 0 ? (
            <p className="font-body text-sm text-text-muted">No upcoming sessions are on this account.</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((booking) => {
                const cancelBlocked = booking.lateCancellationBlocked || !booking.canCancel;
                return (
                  <article key={booking.id} className="rounded-md border border-border bg-surface-2 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">
                          {booking.serviceLabel}
                        </p>
                        <p className="mt-1 font-body text-sm font-semibold text-text">
                          {formatSessionDate(booking.startsAt)}
                        </p>
                        <p className="mt-1 font-body text-xs text-text-muted">
                          {booking.durationMinutes} min
                          {booking.lateCancellation ? ' · inside 24 hours' : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={cancelBlocked || cancelingBookingId === booking.id}
                        onClick={() => void cancelBooking(booking)}
                      >
                        {cancelingBookingId === booking.id
                          ? 'Canceling'
                          : booking.lateCancellation && booking.canCancel
                            ? 'Use Late Cancel'
                            : 'Cancel'}
                      </Button>
                    </div>
                    {booking.lateCancellationBlocked ? (
                      <p className="mt-3 rounded-md border border-border bg-bg/60 p-2 font-body text-xs leading-relaxed text-text-muted">
                        This session is inside 24 hours and the late-cancel courtesy has already been used. Message
                        Ashley to change it.
                      </p>
                    ) : booking.lateCancellation ? (
                      <p className="mt-3 rounded-md border border-gold/25 bg-gold/10 p-2 font-body text-xs leading-relaxed text-text-muted">
                        This is inside 24 hours. You can cancel once as a courtesy; after that, late changes need Ashley.
                      </p>
                    ) : null}
                  </article>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
