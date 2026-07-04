'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Clock,
  CreditCard,
  ExternalLink,
  Loader2,
  Mail,
  MessageSquare,
  ShieldCheck,
  UserRound,
  WalletCards,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { BrandWordmark } from '@/components/BrandWordmark';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { BOOKING_CONSENT_FORM_URL, bookingRequiresConsent } from '@/lib/bookingConsent';
import { combineBookingTzDateAndTime, formatCalendarDateKey } from '@/lib/bookingAvailability';
import { BOOKING_SERVICES, type BookingServiceType } from '@/lib/bookingServices';

type BookingStep = 'basic' | 'date' | 'time' | 'package' | 'payment';
type CommunicationPreference = 'email' | 'text';

type RemoteSlot = {
  time: string;
  available: boolean;
  reason: string | null;
};

type FirstSessionBookingFlowProps = {
  availabilityEndpoint?: string;
  checkoutEndpoint?: string;
  initialBookingStatus?: string | null;
  initialServiceType?: BookingServiceType;
  profile: {
    email: string;
    fullName: string | null;
    phone: string | null;
  };
};

const steps: Array<{ id: BookingStep; label: string; eyebrow: string; icon: typeof UserRound }> = [
  { id: 'basic', label: 'Basic Info', eyebrow: 'Identity', icon: UserRound },
  { id: 'date', label: 'Choose Date', eyebrow: 'Calendar', icon: CalendarDays },
  { id: 'time', label: 'Choose Time', eyebrow: 'Availability', icon: Clock },
  { id: 'package', label: 'Choose Package', eyebrow: 'Plan', icon: WalletCards },
  { id: 'payment', label: 'Payment & Billing', eyebrow: 'Stripe', icon: CreditCard },
];

const packageOptions: BookingServiceType[] = [
  'free',
  'sessions_4',
  'sessions_8',
  'sessions_12',
  'online_coaching_starter',
  'online_coaching_elevate',
  'online_coaching_elite',
];

const packageHighlights: Record<BookingServiceType, string[]> = {
  free: ['60-minute assessment', 'No card required', 'Best for first fit check'],
  sessions_4: ['Four in-person sessions', 'One-time package', 'Good two-week launch'],
  sessions_8: ['Eight monthly sessions', 'One-time package', 'Steady training rhythm'],
  sessions_12: ['Twelve monthly sessions', 'One-time package', 'High-touch accountability'],
  online_coaching_starter: ['Monthly coaching', 'Programming and check-ins', 'Remote-first support'],
  online_coaching_elevate: ['Priority feedback', 'Eight coaching sessions', 'Progressive programming'],
  online_coaching_elite: ['Advanced progression', 'Priority support', 'Highest accountability'],
  meal_prep: ['Planning session', 'Ideal Nutrition links', 'No card required'],
};

const SESSION_DURATION_MINUTES = 60;
const stepMotion = {
  initial: { opacity: 0, y: 18, scale: 0.985 },
  animate: { opacity: 1, y: 0, scale: 1 },
  exit: { opacity: 0, y: -12, scale: 0.985 },
  transition: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
};

function normalizeMobileNumber(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  return null;
}

function calendarDate(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day, 12, 0, 0, 0));
}

function todayInBookingTimezone(): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);
  return calendarDate(year, month, day);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildDateOptions(): Date[] {
  const firstBookable = addDays(todayInBookingTimezone(), 1);
  return Array.from({ length: 18 }, (_, index) => addDays(firstBookable, index));
}

function formatDateParts(date: Date): { weekday: string; day: string; month: string } {
  return {
    weekday: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(date),
    day: new Intl.DateTimeFormat('en-US', { day: '2-digit', timeZone: 'UTC' }).format(date),
    month: new Intl.DateTimeFormat('en-US', { month: 'short', timeZone: 'UTC' }).format(date),
  };
}

function formatLongDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

function paymentModeLabel(serviceType: BookingServiceType): string {
  const mode = BOOKING_SERVICES[serviceType].paymentMode;
  if (mode === 'subscription') return 'Monthly via Stripe';
  if (mode === 'payment') return 'Pay once via Stripe';
  return 'No card required';
}

function nextStep(current: BookingStep): BookingStep {
  const index = steps.findIndex((step) => step.id === current);
  return steps[Math.min(index + 1, steps.length - 1)].id;
}

function stepIndex(step: BookingStep): number {
  return steps.findIndex((item) => item.id === step);
}

export function FirstSessionBookingFlow({
  availabilityEndpoint = '/api/bookings/availability',
  checkoutEndpoint = '/api/bookings/checkout',
  initialBookingStatus,
  initialServiceType = 'free',
  profile,
}: FirstSessionBookingFlowProps) {
  const dateOptions = useMemo(() => buildDateOptions(), []);
  const [activeStep, setActiveStep] = useState<BookingStep>('basic');
  const [furthestStep, setFurthestStep] = useState<BookingStep>('basic');
  const [clientName, setClientName] = useState(profile.fullName ?? '');
  const [clientPhone, setClientPhone] = useState(profile.phone ?? '');
  const [communicationPreference, setCommunicationPreference] = useState<CommunicationPreference>('email');
  const [selectedDate, setSelectedDate] = useState(() => dateOptions[0]);
  const selectedDateKey = formatCalendarDateKey(selectedDate);
  const [slots, setSlots] = useState<RemoteSlot[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [serviceType, setServiceType] = useState<BookingServiceType>(initialServiceType);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(() => {
    if (initialBookingStatus === 'success') return 'Payment received. We are confirming your booking.';
    if (initialBookingStatus === 'confirmed') return 'You are booked. Your confirmation is on the way.';
    if (initialBookingStatus === 'calendar_pending') return 'You are booked. The team is finalizing your calendar invite.';
    return null;
  });
  const completionFromReturn =
    initialBookingStatus === 'success' ||
    initialBookingStatus === 'confirmed' ||
    initialBookingStatus === 'calendar_pending';

  const selectedService = BOOKING_SERVICES[serviceType];
  const requiresPayment = selectedService.paymentMode !== 'free';
  const requiresConsent = bookingRequiresConsent(serviceType);
  const normalizedPhone = normalizeMobileNumber(clientPhone);
  const selectedSlot = selectedTime ? slots.find((slot) => slot.time === selectedTime) : null;
  const canSubmit =
    Boolean(clientName.trim()) &&
    Boolean(selectedTime) &&
    Boolean(selectedSlot?.available) &&
    termsAccepted &&
    (communicationPreference === 'email' || Boolean(normalizedPhone));

  useEffect(() => {
    let cancelled = false;

    async function loadSlots() {
      setSlotsLoading(true);
      setSlotsError(null);
      try {
        const query = new URLSearchParams({
          date: selectedDateKey,
          durationMinutes: String(SESSION_DURATION_MINUTES),
        });
        const res = await fetch(`${availabilityEndpoint}?${query.toString()}`, { cache: 'no-store' });
        const payload = (await res.json().catch(() => ({}))) as { times?: RemoteSlot[]; error?: string };
        if (!res.ok) throw new Error(payload.error ?? 'Unable to load available times.');
        const nextSlots = Array.isArray(payload.times) ? payload.times : [];
        if (!cancelled) {
          setSlots(nextSlots);
          setSelectedTime((current) => {
            if (current && nextSlots.some((slot) => slot.time === current && slot.available)) return current;
            return nextSlots.find((slot) => slot.available)?.time ?? null;
          });
        }
      } catch (error) {
        if (!cancelled) {
          setSlots([]);
          setSelectedTime(null);
          setSlotsError(error instanceof Error ? error.message : 'Unable to load available times.');
        }
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [availabilityEndpoint, selectedDateKey]);

  function visitStep(step: BookingStep) {
    if (stepIndex(step) <= stepIndex(furthestStep)) {
      setSubmitError(null);
      setActiveStep(step);
    }
  }

  function advance() {
    const validation = validateStep(activeStep);
    if (validation) {
      setSubmitError(validation);
      return;
    }
    const next = nextStep(activeStep);
    setSubmitError(null);
    setActiveStep(next);
    if (stepIndex(next) > stepIndex(furthestStep)) setFurthestStep(next);
  }

  function validateStep(step: BookingStep): string | null {
    if (step === 'basic') {
      if (!clientName.trim()) return 'Enter your name before choosing a date.';
      if (communicationPreference === 'text' && !normalizedPhone) {
        return 'Enter a valid mobile number for text confirmations.';
      }
    }
    if (step === 'time' && (!selectedTime || !selectedSlot?.available)) {
      return 'Choose an available time before continuing.';
    }
    if (step === 'payment' && !termsAccepted) {
      return 'Agree to the booking terms before continuing.';
    }
    return null;
  }

  async function submitBooking() {
    const validation = validateStep('payment');
    if (validation) {
      setSubmitError(validation);
      return;
    }
    if (!selectedTime || !canSubmit || submitting) return;

    const start = combineBookingTzDateAndTime(selectedDateKey, selectedTime);
    const end = new Date(start.getTime() + SESSION_DURATION_MINUTES * 60 * 1000);

    setSubmitting(true);
    setSubmitError(null);
    setStatusMessage(requiresPayment ? 'Creating your Stripe checkout link.' : 'Confirming your session.');

    try {
      const res = await fetch(checkoutEndpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          serviceType,
          startsAt: start.toISOString(),
          endsAt: end.toISOString(),
          durationMinutes: SESSION_DURATION_MINUTES,
          clientName: clientName.trim(),
          clientPhone: normalizedPhone ?? undefined,
          communicationPreference,
          consentAcknowledged: requiresConsent ? true : undefined,
        }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        checkoutUrl?: string;
        redirectUrl?: string;
        error?: string;
        calendarStatus?: string;
      };

      if (payload.checkoutUrl) {
        setStatusMessage('Opening Stripe Checkout now.');
        window.location.href = payload.checkoutUrl;
        return;
      }

      if (!res.ok) {
        if (payload.redirectUrl) window.location.href = payload.redirectUrl;
        throw new Error(payload.error ?? 'Unable to confirm booking.');
      }

      if (payload.redirectUrl) {
        const url = new URL(payload.redirectUrl);
        window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
      }
      setStatusMessage(
        payload.calendarStatus === 'pending'
          ? 'You are booked. The team is finalizing your calendar invite.'
          : `You are booked. Your ${communicationPreference === 'text' ? 'text' : 'email'} confirmation is on the way.`
      );
      setFurthestStep('payment');
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Unable to confirm booking.');
      setStatusMessage(null);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-dvh overflow-x-hidden bg-bg text-text">
      <div className="pointer-events-none fixed inset-0 opacity-80">
        <div className="absolute inset-x-0 top-0 h-72 bg-[linear-gradient(180deg,rgba(242,79,9,0.12),transparent_70%)]" />
      </div>

      <section className="relative mx-auto flex min-h-dvh w-full max-w-7xl flex-col px-4 pb-6 pt-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between gap-4">
          <BrandWordmark className="w-[178px]" />
          <SignOutButton compact className="bg-surface/70" />
        </header>

        <div className="grid flex-1 gap-5 py-5 lg:grid-cols-[320px_minmax(0,1fr)] lg:py-8">
          <aside className="flex flex-col justify-between rounded-md border border-gold/15 bg-surface-2/72 p-4 shadow-glass lg:min-h-[calc(100dvh-7rem)]">
            <div>
              <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">First session</p>
              <h1 className="mt-3 font-section text-4xl leading-none tracking-normal text-text sm:text-5xl">
                Book your training block
              </h1>
              <p className="mt-4 font-body text-sm leading-relaxed text-text-muted">
                Move one decision at a time. Your date, time, package, and payment handoff stay visible before Stripe opens.
              </p>

              <nav aria-label="Booking progress" className="mt-6 space-y-2">
                {steps.map((step, index) => {
                  const Icon = step.icon;
                  const active = activeStep === step.id && !statusMessage;
                  const complete = Boolean(statusMessage) || stepIndex(step.id) < stepIndex(activeStep);
                  const unlocked = stepIndex(step.id) <= stepIndex(furthestStep);
                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => visitStep(step.id)}
                      disabled={!unlocked || Boolean(statusMessage)}
                      className={`group grid w-full grid-cols-[2.25rem_1fr_auto] items-center gap-3 rounded-md border px-3 py-3 text-left transition ${
                        active
                          ? 'border-gold/60 bg-gold/10 text-text shadow-[0_0_24px_rgba(242,79,9,0.16)]'
                          : complete
                            ? 'border-gold/20 bg-bg/55 text-text-muted'
                            : 'border-border bg-bg/35 text-text-dim'
                      } disabled:cursor-default`}
                    >
                      <span
                        className={`flex h-9 w-9 items-center justify-center rounded-md border ${
                          active || complete ? 'border-gold/45 text-gold' : 'border-border text-text-dim'
                        }`}
                      >
                        {complete ? <Check className="h-4 w-4" strokeWidth={1.9} /> : <Icon className="h-4 w-4" strokeWidth={1.7} />}
                      </span>
                      <span className="min-w-0">
                        <span className="block font-caption text-[9px] uppercase tracking-[0.14em] opacity-70">
                          {step.eyebrow}
                        </span>
                        <span className="mt-1 block font-control text-sm font-semibold">{step.label}</span>
                      </span>
                      <span className="font-caption text-[9px] uppercase tracking-[0.12em] opacity-55">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            <SummaryPanel
              communicationPreference={communicationPreference}
              selectedDate={selectedDate}
              selectedServiceType={serviceType}
              selectedTime={selectedTime}
            />
          </aside>

          <section className="flex min-h-[min(760px,calc(100dvh-7rem))] flex-col rounded-md border border-gold/15 bg-surface/74 p-4 shadow-glass-lg sm:p-6 lg:p-8">
            {statusMessage && initialBookingStatus !== 'cancelled' ? (
              <CompletionPanel
                showSelectionDetails={!completionFromReturn}
                statusMessage={statusMessage}
                selectedDate={selectedDate}
                selectedServiceType={serviceType}
                selectedTime={selectedTime}
              />
            ) : (
              <>
                <div className="mb-5 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-caption text-[10px] uppercase tracking-[0.18em] text-gold">
                      {steps.find((step) => step.id === activeStep)?.eyebrow}
                    </p>
                    <h2 className="mt-2 font-section text-4xl leading-none tracking-normal text-text sm:text-5xl">
                      {steps.find((step) => step.id === activeStep)?.label}
                    </h2>
                  </div>
                  <div className="rounded-md border border-border bg-bg/50 px-3 py-2 text-right">
                    <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">Selected</p>
                    <p className="mt-1 font-body text-xs text-text-muted">{selectedService.label}</p>
                  </div>
                </div>

                <div className="min-h-0 flex-1">
                  <AnimatePresence mode="wait">
                    {activeStep === 'basic' ? (
                      <BasicInfoStep
                        key="basic"
                        clientName={clientName}
                        clientPhone={clientPhone}
                        communicationPreference={communicationPreference}
                        email={profile.email}
                        error={submitError}
                        onClientNameChange={setClientName}
                        onClientPhoneChange={setClientPhone}
                        onCommunicationPreferenceChange={setCommunicationPreference}
                      />
                    ) : activeStep === 'date' ? (
                      <DateStep
                        key="date"
                        dates={dateOptions}
                        selectedDate={selectedDate}
                        onSelectDate={setSelectedDate}
                      />
                    ) : activeStep === 'time' ? (
                      <TimeStep
                        key="time"
                        error={submitError ?? slotsError}
                        loading={slotsLoading}
                        selectedDate={selectedDate}
                        selectedTime={selectedTime}
                        slots={slots}
                        onSelectTime={setSelectedTime}
                      />
                    ) : activeStep === 'package' ? (
                      <PackageStep
                        key="package"
                        selectedServiceType={serviceType}
                        onSelectService={setServiceType}
                      />
                    ) : (
                      <PaymentStep
                        key="payment"
                        communicationPreference={communicationPreference}
                        error={submitError}
                        requiresPayment={requiresPayment}
                        selectedDate={selectedDate}
                        selectedServiceType={serviceType}
                        selectedTime={selectedTime}
                        submitting={submitting}
                        termsAccepted={termsAccepted}
                        statusMessage={statusMessage}
                        onSubmit={submitBooking}
                        onTermsAcceptedChange={setTermsAccepted}
                      />
                    )}
                  </AnimatePresence>
                </div>

                <footer className="mt-6 flex flex-col-reverse gap-3 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
                  <button
                    type="button"
                    onClick={() => {
                      const previous = steps[Math.max(0, stepIndex(activeStep) - 1)].id;
                      setSubmitError(null);
                      setActiveStep(previous);
                    }}
                    disabled={activeStep === 'basic' || submitting}
                    className="ios-pill inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-border px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-text-muted transition hover:border-gold/55 hover:text-gold disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                    Back
                  </button>
                  {activeStep === 'payment' ? null : (
                    <button
                      type="button"
                      onClick={advance}
                      disabled={submitting}
                      className="ios-pill inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-gold px-5 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {activeStep === 'package' ? 'Continue to Payment' : `Continue to ${steps[stepIndex(nextStep(activeStep))].label}`}
                      <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                    </button>
                  )}
                </footer>
              </>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function BasicInfoStep({
  clientName,
  clientPhone,
  communicationPreference,
  email,
  error,
  onClientNameChange,
  onClientPhoneChange,
  onCommunicationPreferenceChange,
}: {
  clientName: string;
  clientPhone: string;
  communicationPreference: CommunicationPreference;
  email: string;
  error: string | null;
  onClientNameChange: (value: string) => void;
  onClientPhoneChange: (value: string) => void;
  onCommunicationPreferenceChange: (value: CommunicationPreference) => void;
}) {
  return (
    <motion.div {...stepMotion} className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="space-y-4">
        <Field label="Full name" icon={<UserRound className="h-4 w-4" strokeWidth={1.7} />}>
          <input
            value={clientName}
            onChange={(event) => onClientNameChange(event.target.value)}
            autoComplete="name"
            className="min-h-12 w-full rounded-md border border-border bg-bg/65 px-3 font-body text-sm text-text outline-none transition focus:border-gold"
            placeholder="Your name"
          />
        </Field>
        <Field label="Account email" icon={<Mail className="h-4 w-4" strokeWidth={1.7} />}>
          <div className="flex min-h-12 items-center rounded-md border border-border bg-bg/45 px-3 font-body text-sm text-text-muted">
            {email}
          </div>
        </Field>
        <Field label="Mobile number" icon={<MessageSquare className="h-4 w-4" strokeWidth={1.7} />}>
          <input
            value={clientPhone}
            onChange={(event) => onClientPhoneChange(event.target.value)}
            inputMode="tel"
            autoComplete="tel"
            className="min-h-12 w-full rounded-md border border-border bg-bg/65 px-3 font-body text-sm text-text outline-none transition focus:border-gold"
            placeholder="(555) 123-4567"
          />
        </Field>
      </div>

      <aside className="rounded-md border border-border bg-bg/40 p-4">
        <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Communication</p>
        <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
          Choose how you want the completion confirmation sent after booking.
        </p>
        <div className="mt-4 grid gap-2">
          <PreferenceButton
            active={communicationPreference === 'email'}
            icon={<Mail className="h-4 w-4" strokeWidth={1.8} />}
            label="Email"
            detail="Uses your account email"
            onClick={() => onCommunicationPreferenceChange('email')}
          />
          <PreferenceButton
            active={communicationPreference === 'text'}
            icon={<MessageSquare className="h-4 w-4" strokeWidth={1.8} />}
            label="Text"
            detail="Requires a mobile number"
            onClick={() => onCommunicationPreferenceChange('text')}
          />
        </div>
        {error ? <p className="mt-4 rounded-md border border-gold/35 bg-gold/10 p-3 font-body text-xs text-gold">{error}</p> : null}
      </aside>
    </motion.div>
  );
}

function DateStep({
  dates,
  selectedDate,
  onSelectDate,
}: {
  dates: Date[];
  selectedDate: Date;
  onSelectDate: (date: Date) => void;
}) {
  return (
    <motion.div {...stepMotion}>
      <p className="max-w-2xl font-body text-sm leading-relaxed text-text-muted">
        Choose the day that gives you enough room to arrive ready. Availability refreshes as soon as you pick a date.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {dates.map((date) => {
          const parts = formatDateParts(date);
          const active = date.toDateString() === selectedDate.toDateString();
          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate(date)}
              className={`min-h-[128px] rounded-md border p-4 text-left transition ${
                active
                  ? 'border-gold bg-gold/10 text-gold shadow-[0_0_0_1px_rgba(242,79,9,0.24),0_0_26px_rgba(242,79,9,0.2)]'
                  : 'border-border bg-bg/52 text-text hover:border-gold/45 hover:text-gold'
              }`}
            >
              <span className="font-caption text-[9px] uppercase tracking-[0.14em] opacity-70">{parts.weekday}</span>
              <span className="mt-3 block font-headline text-4xl uppercase leading-none">{parts.day}</span>
              <span className="mt-2 block font-body text-sm">{parts.month}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function TimeStep({
  error,
  loading,
  selectedDate,
  selectedTime,
  slots,
  onSelectTime,
}: {
  error: string | null;
  loading: boolean;
  selectedDate: Date;
  selectedTime: string | null;
  slots: RemoteSlot[];
  onSelectTime: (time: string) => void;
}) {
  return (
    <motion.div {...stepMotion}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-body text-sm leading-relaxed text-text-muted">
          Available starts for <span className="font-semibold text-text">{formatLongDate(selectedDate)}</span>.
        </p>
        {loading ? (
          <span className="inline-flex items-center gap-2 font-caption text-[10px] uppercase tracking-[0.14em] text-gold">
            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
            Loading
          </span>
        ) : null}
      </div>
      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {slots.map((slot) => {
          const active = selectedTime === slot.time;
          return (
            <button
              key={slot.time}
              type="button"
              onClick={() => onSelectTime(slot.time)}
              disabled={!slot.available}
              className={`min-h-16 rounded-md border px-4 text-left transition ${
                active
                  ? 'border-gold bg-gold/10 text-gold shadow-[0_0_22px_rgba(242,79,9,0.18)]'
                  : slot.available
                    ? 'border-border bg-bg/55 text-text hover:border-gold/45 hover:text-gold'
                    : 'border-border bg-bg/30 text-text-dim line-through opacity-50'
              }`}
            >
              <span className="font-control text-sm font-semibold">{formatTime(slot.time)}</span>
              <span className="mt-1 block font-caption text-[9px] uppercase tracking-[0.12em] opacity-70">
                {slot.available ? 'Available' : slot.reason ?? 'Unavailable'}
              </span>
            </button>
          );
        })}
      </div>
      {!loading && slots.length === 0 ? (
        <p className="mt-5 rounded-md border border-border bg-bg/45 p-4 font-body text-sm text-text-muted">
          No availability came back for this day. Choose another date or try again in a moment.
        </p>
      ) : null}
      {error ? <p className="mt-4 rounded-md border border-gold/35 bg-gold/10 p-3 font-body text-xs text-gold">{error}</p> : null}
    </motion.div>
  );
}

function PackageStep({
  selectedServiceType,
  onSelectService,
}: {
  selectedServiceType: BookingServiceType;
  onSelectService: (serviceType: BookingServiceType) => void;
}) {
  return (
    <motion.div {...stepMotion}>
      <p className="max-w-2xl font-body text-sm leading-relaxed text-text-muted">
        Start with the free assessment or lock in the package you already know you want. Stripe collects payment details only after you agree to the terms.
      </p>
      <div className="mt-6 grid gap-3 lg:grid-cols-2">
        {packageOptions.map((type) => {
          const service = BOOKING_SERVICES[type];
          const active = selectedServiceType === type;
          return (
            <button
              key={type}
              type="button"
              onClick={() => onSelectService(type)}
              className={`rounded-md border p-4 text-left transition ${
                active
                  ? 'border-gold bg-gold/10 text-text shadow-[0_0_26px_rgba(242,79,9,0.18)]'
                  : 'border-border bg-bg/50 text-text-muted hover:border-gold/45 hover:text-text'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
                    {paymentModeLabel(type)}
                  </p>
                  <h3 className="mt-2 font-section text-3xl leading-none tracking-normal">{service.label}</h3>
                </div>
                <span
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border ${
                    active ? 'border-gold bg-gold text-bg' : 'border-border text-text-dim'
                  }`}
                >
                  {active ? <Check className="h-4 w-4" strokeWidth={2} /> : null}
                </span>
              </div>
              <p className="mt-3 font-body text-sm leading-relaxed">{service.description}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {packageHighlights[type].map((item) => (
                  <span
                    key={item}
                    className="rounded-md border border-border bg-bg/55 px-2.5 py-1.5 font-caption text-[9px] uppercase tracking-[0.12em] text-text-muted"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
}

function PaymentStep({
  communicationPreference,
  error,
  requiresPayment,
  selectedDate,
  selectedServiceType,
  selectedTime,
  statusMessage,
  submitting,
  termsAccepted,
  onSubmit,
  onTermsAcceptedChange,
}: {
  communicationPreference: CommunicationPreference;
  error: string | null;
  requiresPayment: boolean;
  selectedDate: Date;
  selectedServiceType: BookingServiceType;
  selectedTime: string | null;
  statusMessage: string | null;
  submitting: boolean;
  termsAccepted: boolean;
  onSubmit: () => void;
  onTermsAcceptedChange: (accepted: boolean) => void;
}) {
  const service = BOOKING_SERVICES[selectedServiceType];
  return (
    <motion.div {...stepMotion} className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div>
        <p className="max-w-2xl font-body text-sm leading-relaxed text-text-muted">
          Review the appointment before the handoff. Paid packages open Stripe in the same click after the booking hold is created.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <ReviewTile label="Session" value={service.label} />
          <ReviewTile label="Date" value={formatLongDate(selectedDate)} />
          <ReviewTile label="Time" value={selectedTime ? formatTime(selectedTime) : 'Choose a time'} />
          <ReviewTile label="Confirmation" value={communicationPreference === 'text' ? 'Text message preferred' : 'Email preferred'} />
        </div>
        <label className="mt-5 flex items-start gap-3 rounded-md border border-border bg-bg/55 p-4">
          <input
            type="checkbox"
            checked={termsAccepted}
            onChange={(event) => onTermsAcceptedChange(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-border accent-gold"
          />
          <span className="font-body text-sm leading-relaxed text-text-muted">
            I agree to the booking terms, cancellation policy, and required training consent.{' '}
            <a
              href={BOOKING_CONSENT_FORM_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-gold hover:text-text"
            >
              Open consent form <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
            </a>
          </span>
        </label>
        {error ? <p className="mt-4 rounded-md border border-gold/35 bg-gold/10 p-3 font-body text-xs text-gold">{error}</p> : null}
        {statusMessage ? <p className="mt-4 font-body text-sm text-text-muted">{statusMessage}</p> : null}
      </div>

      <aside className="rounded-md border border-gold/20 bg-bg/52 p-4">
        <ShieldCheck className="h-7 w-7 text-gold" strokeWidth={1.7} />
        <h3 className="mt-4 font-section text-3xl leading-none tracking-normal">
          {requiresPayment ? 'Stripe opens next' : 'No payment needed'}
        </h3>
        <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
          {requiresPayment
            ? 'Stripe securely collects card and billing details. You can still go back before clicking this CTA.'
            : 'The first session can be confirmed without a card. Your preferred confirmation is sent after booking.'}
        </p>
        <button
          type="button"
          onClick={onSubmit}
          disabled={submitting}
          className="ios-pill mt-5 inline-flex min-h-14 w-full items-center justify-center gap-2 rounded-md bg-gold px-5 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} /> : requiresPayment ? <CreditCard className="h-4 w-4" strokeWidth={1.8} /> : <Check className="h-4 w-4" strokeWidth={1.8} />}
          {submitting ? 'Working' : requiresPayment ? 'Agree & Open Stripe' : 'Confirm Free Session'}
        </button>
      </aside>
    </motion.div>
  );
}

function CompletionPanel({
  showSelectionDetails,
  statusMessage,
  selectedDate,
  selectedServiceType,
  selectedTime,
}: {
  showSelectionDetails: boolean;
  statusMessage: string;
  selectedDate: Date;
  selectedServiceType: BookingServiceType;
  selectedTime: string | null;
}) {
  const service = BOOKING_SERVICES[selectedServiceType];
  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <div className="w-full max-w-xl text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md border border-gold/45 bg-gold/12 text-gold">
          <Check className="h-7 w-7" strokeWidth={1.8} />
        </div>
        <p className="mt-6 font-caption text-[10px] uppercase tracking-[0.18em] text-gold">Booking complete</p>
        <h2 className="mt-3 font-section text-5xl leading-none tracking-normal text-text">{statusMessage}</h2>
        {showSelectionDetails ? (
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <ReviewTile label="Session" value={service.label} />
            <ReviewTile label="Date" value={formatLongDate(selectedDate)} />
            <ReviewTile label="Time" value={selectedTime ? formatTime(selectedTime) : 'Confirmed'} />
          </div>
        ) : (
          <p className="mx-auto mt-5 max-w-md font-body text-sm leading-relaxed text-text-muted">
            Your saved booking details remain with Stripe, your calendar invite, and the confirmation message sent by the team.
          </p>
        )}
      </div>
    </div>
  );
}

function Field({ children, icon, label }: { children: React.ReactNode; icon: React.ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-2 flex items-center gap-2 font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

function PreferenceButton({
  active,
  detail,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  detail: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`grid min-h-16 grid-cols-[2rem_1fr_auto] items-center gap-3 rounded-md border px-3 text-left transition ${
        active ? 'border-gold bg-gold/10 text-text' : 'border-border bg-bg/45 text-text-muted hover:border-gold/45'
      }`}
    >
      <span className={active ? 'text-gold' : 'text-text-dim'}>{icon}</span>
      <span>
        <span className="block font-control text-sm font-semibold">{label}</span>
        <span className="mt-1 block font-body text-xs opacity-75">{detail}</span>
      </span>
      <span className={`flex h-5 w-5 items-center justify-center rounded-full border ${active ? 'border-gold bg-gold text-bg' : 'border-border'}`}>
        {active ? <Check className="h-3 w-3" strokeWidth={2} /> : null}
      </span>
    </button>
  );
}

function ReviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-bg/48 p-3 text-left">
      <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">{label}</p>
      <p className="mt-2 font-body text-sm font-semibold leading-snug text-text">{value}</p>
    </div>
  );
}

function SummaryPanel({
  communicationPreference,
  selectedDate,
  selectedServiceType,
  selectedTime,
}: {
  communicationPreference: CommunicationPreference;
  selectedDate: Date;
  selectedServiceType: BookingServiceType;
  selectedTime: string | null;
}) {
  const service = BOOKING_SERVICES[selectedServiceType];
  return (
    <div className="mt-6 rounded-md border border-border bg-bg/42 p-4">
      <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-text-dim">Live summary</p>
      <dl className="mt-3 space-y-3">
        <SummaryRow label="Date" value={formatLongDate(selectedDate)} />
        <SummaryRow label="Time" value={selectedTime ? formatTime(selectedTime) : 'Choose time'} />
        <SummaryRow label="Package" value={service.label} />
        <SummaryRow label="Confirm by" value={communicationPreference === 'text' ? 'Text' : 'Email'} />
      </dl>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">{label}</dt>
      <dd className="max-w-[12rem] text-right font-body text-xs leading-snug text-text-muted">{value}</dd>
    </div>
  );
}
