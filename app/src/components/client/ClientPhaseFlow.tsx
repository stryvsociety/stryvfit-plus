'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  Bell,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  CreditCard,
  Dumbbell,
  Menu,
  NotebookPen,
  Play,
  RefreshCw,
  Video,
  WalletCards,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode, TouchEvent } from 'react';
import { GoogleScheduler, type SchedulerBookingDraft } from '@/components/scheduling/GoogleScheduler';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { BrandWordmark } from '@/components/BrandWordmark';
import { ThemeToggle, usePersistedTheme } from '@/components/ui/ThemeToggle';
import { parseBookingService, type BookingServiceType } from '@/lib/bookingServices';
import { historyPathFromRedirectUrl } from '@/lib/clientNavigation';
import type { AdminAppointmentPlan } from '@/lib/adminAppointmentPlans';
import type { AdminWorkoutRoutine } from '@/lib/adminWorkoutRoutines';
import type { BillingSummary } from '@/lib/billing';

type Phase = 'calendar' | 'workout' | 'journal';
type SessionMode = 'none' | 'remote' | 'in-person';

type DisplayWorkoutBlock = {
  name: string;
  detail: string;
  description: string;
  demo: string;
  sets: string[];
  minutes: number;
};

const workoutBlocks: DisplayWorkoutBlock[] = [
  {
    name: 'Primer',
    detail: 'Band pull-aparts, dead bugs, hip airplanes',
    description: 'Move slowly through each rep. The goal is shoulder position, trunk tension, and hip control before load shows up.',
    demo: 'Activation sequence',
    sets: ['Round 1', 'Round 2'],
    minutes: 8,
  },
  {
    name: 'Strength',
    detail: 'Goblet squat 4x8, DB row 4x10, tempo push-up 3x8',
    description: 'Keep two reps in reserve on the first two sets, then build pressure on the final round while keeping the tempo clean.',
    demo: 'Squat, row, push-up circuit',
    sets: ['Set 1', 'Set 2', 'Set 3', 'Set 4'],
    minutes: 32,
  },
  {
    name: 'Conditioning',
    detail: 'EMOM 10: bike sprint, suitcase carry, plank reach',
    description: 'Push the bike, then use the carry and plank to bring breathing back under control before the next minute starts.',
    demo: 'EMOM pacing demo',
    sets: ['Min 1', 'Min 2', 'Min 3', 'Min 4', 'Min 5', 'Min 6', 'Min 7', 'Min 8', 'Min 9', 'Min 10'],
    minutes: 10,
  },
  {
    name: 'Cooldown',
    detail: 'Breathing reset, hamstring floss, shoulder CARs',
    description: 'Finish with nasal breathing and smooth range of motion. This is the downshift that protects tomorrow.',
    demo: 'Mobility reset',
    sets: ['Breathing', 'Hamstrings', 'Shoulders'],
    minutes: 6,
  },
];

const journalPrompts = [
  'What felt strongest today?',
  'Where did form need the most attention?',
  'What meal would make tomorrow easier?',
];

function useClientQueryState(initialServiceType: BookingServiceType): {
  sessionMode: SessionMode;
  serviceType: BookingServiceType;
  bookingStatus: string | null;
  billingAction: 'update' | 'retry' | null;
} {
  const [mode, setMode] = useState<SessionMode>('none');
  const [serviceType, setServiceType] = useState<BookingServiceType>(initialServiceType);
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);
  const [billingAction, setBillingAction] = useState<'update' | 'retry' | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('session');
    setMode(requested === 'remote' || requested === 'in-person' ? requested : 'none');
    setServiceType(params.has('service') ? parseBookingService(params.get('service')) : initialServiceType);
    setBookingStatus(params.get('booking'));
    const billing = params.get('billing');
    setBillingAction(billing === 'update' || billing === 'retry' ? billing : null);
  }, [initialServiceType]);

  return { sessionMode: mode, serviceType, bookingStatus, billingAction };
}

export function ClientPhaseFlow({
  appointmentPlans = [],
  initialServiceType = 'free',
  workoutRoutines = [],
}: {
  appointmentPlans?: AdminAppointmentPlan[];
  initialServiceType?: BookingServiceType;
  workoutRoutines?: AdminWorkoutRoutine[];
}) {
  const { sessionMode, serviceType, bookingStatus, billingAction } = useClientQueryState(initialServiceType);
  const hasSession = sessionMode !== 'none';
  const latestWorkoutRoutine = workoutRoutines[0] ?? null;
  const [phase, setPhase] = useState<Phase>('calendar');
  const [menuOpen, setMenuOpen] = useState(false);
  const [countdown, setCountdown] = useState(12);
  const [workoutComplete, setWorkoutComplete] = useState(false);
  const [deliberating, setDeliberating] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [billingBusy, setBillingBusy] = useState(false);
  const [retryBusy, setRetryBusy] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [billingSummary, setBillingSummary] = useState<BillingSummary | null>(null);
  const [billingLoading, setBillingLoading] = useState(true);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);
  const [bookingMessage, setBookingMessage] = useState<string | null>(() => {
    if (bookingStatus === 'success') return 'Payment received. We are confirming your calendar event.';
    if (bookingStatus === 'confirmed') return 'You are booked. Your calendar confirmation is on the way.';
    if (bookingStatus === 'calendar_pending') return 'You are booked. The team is finalizing your calendar invite.';
    if (bookingStatus === 'cancelled') return 'Checkout was cancelled. Your time was released.';
    return null;
  });
  const [theme, setTheme] = usePersistedTheme('stryvfit-theme', 'dark');
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const billingActionHandled = useRef(false);
  const paymentState = useMemo(
    () => ({
      requiresPayment: billingSummary?.requiresPayment ?? false,
      bookingLocked: billingSummary?.bookingLocked ?? false,
    }),
    [billingSummary]
  );

  useEffect(() => {
    if (!hasSession || countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, hasSession]);

  useEffect(() => {
    if (hasSession && countdown === 0) setPhase('workout');
  }, [countdown, hasSession]);

  async function refreshBillingSummary() {
    setBillingLoading(true);
    try {
      const res = await fetch('/api/billing/summary', { cache: 'no-store' });
      const payload = (await res.json().catch(() => ({}))) as { billing?: BillingSummary; error?: string };
      if (!res.ok || !payload.billing) throw new Error(payload.error ?? 'Unable to load billing');
      setBillingSummary(payload.billing);
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : 'Unable to load billing');
    } finally {
      setBillingLoading(false);
    }
  }

  useEffect(() => {
    void refreshBillingSummary();
  }, []);

  useEffect(() => {
    if (!billingSummary?.requiresPayment) return;
    setPaymentOpen(true);
  }, [billingSummary?.requiresPayment]);

  function deliberateNext(next: Phase) {
    setDeliberating(true);
    window.setTimeout(() => {
      setDeliberating(false);
      if (paymentState.requiresPayment) {
        setPaymentOpen(true);
        return;
      }
      setPhase(next);
    }, 850);
  }

  function handleAdvance(next: Phase = 'journal') {
    if (phase === 'workout' && !workoutComplete) return;
    deliberateNext(next);
  }

  async function createBooking(draft: SchedulerBookingDraft) {
    const res = await fetch('/api/bookings/checkout', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(draft),
    });
    const payload = (await res.json().catch(() => ({}))) as {
      error?: string;
      checkoutUrl?: string;
      redirectUrl?: string;
      status?: string;
      calendarStatus?: string;
    };

    if (payload.checkoutUrl) {
      setBookingMessage('Opening secure checkout. Stripe will collect your payment details next.');
      window.location.assign(payload.checkoutUrl);
      return;
    }

    if (payload.redirectUrl) {
      if (!res.ok) {
        window.location.assign(payload.redirectUrl);
        return;
      }
      window.history.replaceState(null, '', historyPathFromRedirectUrl(payload.redirectUrl));
    }

    if (!res.ok) {
      throw new Error(payload.error ?? 'Unable to create booking');
    }

    setBookingMessage(
      payload.calendarStatus === 'pending'
        ? 'You are booked. Your calendar invite is being finalized by the team.'
        : 'You are booked. Your calendar confirmation is on the way.'
    );
  }

  async function openBillingPortal() {
    if (billingBusy) return;
    const hostedInvoiceUrl = billingSummary?.requiresPayment ? billingSummary.latestInvoice?.hostedInvoiceUrl : null;
    if (hostedInvoiceUrl) {
      window.location.assign(hostedInvoiceUrl);
      return;
    }
    setBillingBusy(true);
    setBillingMessage(null);
    try {
      const returnPath = `${window.location.pathname}${window.location.search}`;
      const res = await fetch('/api/billing/portal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ returnPath }),
      });
      const payload = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !payload.url) {
        throw new Error(payload.error ?? 'Unable to open billing');
      }
      window.location.assign(payload.url);
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : 'Unable to open billing');
    } finally {
      setBillingBusy(false);
    }
  }

  async function retryBillingPayment() {
    if (retryBusy) return;
    setRetryBusy(true);
    setBillingMessage(null);
    try {
      const res = await fetch('/api/billing/retry', { method: 'POST' });
      const payload = (await res.json().catch(() => ({}))) as { billing?: BillingSummary; error?: string };
      if (!res.ok || !payload.billing) {
        throw new Error(payload.error ?? 'Unable to retry payment');
      }
      setBillingSummary(payload.billing);
      setBillingMessage(payload.billing.requiresPayment ? 'Retry sent. Stripe still needs attention.' : 'Payment retry succeeded.');
      if (!payload.billing.requiresPayment) setPaymentOpen(false);
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : 'Unable to retry payment');
    } finally {
      setRetryBusy(false);
    }
  }

  function applicationServerKey(publicKey: string): ArrayBuffer {
    const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
    const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw = window.atob(base64);
    const bytes = Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  }

  async function enableBillingPushAlerts() {
    if (pushBusy) return;
    setPushBusy(true);
    setBillingMessage(null);
    try {
      if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
        throw new Error('Push alerts are not available in this browser.');
      }

      const keyRes = await fetch('/api/pwa/push-subscription', { cache: 'no-store' });
      const keyPayload = (await keyRes.json().catch(() => ({}))) as {
        enabled?: boolean;
        publicKey?: string;
        error?: string;
      };
      if (!keyRes.ok || !keyPayload.enabled || !keyPayload.publicKey) {
        throw new Error(keyPayload.error ?? 'Push alerts are not configured yet.');
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') throw new Error('Push alerts were not enabled.');

      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription =
        existing ??
        (await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: applicationServerKey(keyPayload.publicKey),
        }));

      const saveRes = await fetch('/api/pwa/push-subscription', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!saveRes.ok) {
        const payload = (await saveRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? 'Unable to save push alerts');
      }

      setBillingMessage('Billing push alerts are enabled for this device.');
    } catch (error) {
      setBillingMessage(error instanceof Error ? error.message : 'Unable to enable push alerts');
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    if (!billingAction || billingActionHandled.current) return;
    billingActionHandled.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete('billing');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    if (billingAction === 'update') {
      void openBillingPortal();
    } else {
      void retryBillingPayment();
    }
    // Notification action query params are one-shot commands; the ref above prevents replay after state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billingAction]);

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if ((dx > 72 || dy > 72) && phase === 'workout') {
      handleAdvance();
    }
  }

  return (
    <main
      className={`min-h-dvh overflow-x-hidden bg-bg text-text client-theme-${theme}`}
      onTouchStart={(event) => {
        const touch = event.changedTouches[0];
        touchStart.current = { x: touch.clientX, y: touch.clientY };
      }}
      onTouchEnd={onTouchEnd}
    >
      <div className="pointer-events-none fixed inset-0 opacity-70">
        <div className="absolute inset-x-0 top-0 h-72 bg-[radial-gradient(circle_at_50%_0%,rgba(242,79,9,0.18),transparent_62%)]" />
        <div className="absolute bottom-0 right-0 h-80 w-80 bg-[radial-gradient(circle_at_80%_80%,rgba(255,106,36,0.12),transparent_65%)]" />
      </div>

      <section className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-4 pb-24 pt-5 sm:px-6 lg:px-8">
        <header className="flex items-center justify-between">
          <BrandWordmark className="w-[178px]" />
          <div className="flex items-center gap-2">
            <ThemeToggle theme={theme} onChange={setTheme} className="text-text" />
            <SignOutButton compact className="bg-surface/70" />
          </div>
        </header>

        <AnimatePresence mode="wait">
          {deliberating ? (
            <motion.div
              key="deliberating"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="flex flex-1 items-center justify-center"
            >
              <div className="text-center">
                <Activity className="mx-auto h-9 w-9 animate-pulse text-gold" strokeWidth={1.6} />
                <p className="mt-5 font-caption text-[11px] uppercase tracking-[0.18em] text-text-muted">
                  Checking your next best step
                </p>
              </div>
            </motion.div>
          ) : phase === 'workout' && (countdown === 0 || latestWorkoutRoutine) ? (
            <WorkoutPhase
              key="workout"
              remote={sessionMode === 'remote'}
              routine={latestWorkoutRoutine}
              complete={workoutComplete}
              onComplete={() => setWorkoutComplete(true)}
              onAdvance={() => handleAdvance('journal')}
            />
          ) : phase === 'journal' ? (
            <JournalPhase key="journal" />
          ) : (
            <CalendarOnly
              key="calendar"
              hasSession={hasSession}
              countdown={countdown}
              bookingLocked={paymentState.bookingLocked}
              serviceType={serviceType}
              bookingMessage={bookingMessage}
              billingBusy={billingBusy}
              retryBusy={retryBusy}
              pushBusy={pushBusy}
              billingSummary={billingSummary}
              billingLoading={billingLoading}
              billingMessage={billingMessage}
              appointmentPlans={appointmentPlans}
              workoutRoutines={workoutRoutines}
              onOpenBillingPortal={openBillingPortal}
              onRetryBilling={retryBillingPayment}
              onEnablePushAlerts={enableBillingPushAlerts}
              onPreviewWorkout={() => (countdown === 0 || latestWorkoutRoutine) && setPhase('workout')}
              onBookSession={createBooking}
            />
          )}
        </AnimatePresence>
      </section>

      <FloatingMenu
        open={menuOpen}
        onOpenChange={setMenuOpen}
        onSelect={(next) => {
          setMenuOpen(false);
          if (next === 'journal') deliberateNext(next);
          else setPhase(next);
        }}
      />

      <AnimatePresence>
        {paymentOpen ? (
          <PaymentModal
            onClose={() => setPaymentOpen(false)}
            bookingLocked={paymentState.bookingLocked}
            billingBusy={billingBusy}
            retryBusy={retryBusy}
            billingSummary={billingSummary}
            billingMessage={billingMessage}
            onOpenBillingPortal={openBillingPortal}
            onRetryBilling={retryBillingPayment}
          />
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {billingSummary?.requiresPayment ? (
          <BillingRecoveryToast
            billing={billingSummary}
            billingBusy={billingBusy}
            retryBusy={retryBusy}
            onOpenBillingPortal={openBillingPortal}
            onRetryBilling={retryBillingPayment}
          />
        ) : null}
      </AnimatePresence>
    </main>
  );
}

function CalendarOnly({
  hasSession,
  countdown,
  bookingLocked,
  serviceType,
  bookingMessage,
  billingBusy,
  retryBusy,
  pushBusy,
  billingSummary,
  billingLoading,
  billingMessage,
  appointmentPlans,
  workoutRoutines,
  onOpenBillingPortal,
  onRetryBilling,
  onEnablePushAlerts,
  onPreviewWorkout,
  onBookSession,
}: {
  hasSession: boolean;
  countdown: number;
  bookingLocked: boolean;
  serviceType: BookingServiceType;
  bookingMessage: string | null;
  billingBusy: boolean;
  retryBusy: boolean;
  pushBusy: boolean;
  billingSummary: BillingSummary | null;
  billingLoading: boolean;
  billingMessage: string | null;
  appointmentPlans: AdminAppointmentPlan[];
  workoutRoutines: AdminWorkoutRoutine[];
  onOpenBillingPortal: () => void;
  onRetryBilling: () => void;
  onEnablePushAlerts: () => void;
  onPreviewWorkout: () => void;
  onBookSession: (draft: SchedulerBookingDraft) => Promise<void>;
}) {
  const isFreeFirstSession = serviceType === 'free';
  const isOnlineCoaching = serviceType.startsWith('online_coaching_');
  const sessionTitle = isFreeFirstSession
    ? 'StryvFit+ free first session'
    : isOnlineCoaching
      ? 'StryvFit+ online coaching session'
      : 'StryvFit+ training session';
  const sessionDescription = isFreeFirstSession
    ? 'Free first session with Stryv Society Fitness. We will assess goals, movement, schedule, and the best coaching path.'
    : isOnlineCoaching
      ? 'Online coaching session with Stryv Society Fitness. Bring recent training notes, form videos, and questions for your coach.'
      : 'Training session with Stryv Society Fitness. Bring water, training shoes, and any recent notes for your coach.';

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -18 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-1 flex-col justify-center py-8"
    >
      <div className="mx-auto w-full max-w-3xl">
        {hasSession ? (
          <div className="mb-4 rounded-md border border-gold/20 bg-surface-2/80 p-4 shadow-glass">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
                  Session starts soon
                </p>
                <h1 className="mt-2 font-section text-4xl leading-none">Get ready</h1>
              </div>
              <button
                type="button"
                onClick={onPreviewWorkout}
                disabled={countdown > 0 && workoutRoutines.length === 0}
                className="ios-pill inline-flex min-h-11 items-center gap-2 rounded-full border border-border px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-text-muted transition hover:border-gold hover:text-gold disabled:opacity-45"
              >
                <Dumbbell className="h-4 w-4" /> Workout
              </button>
            </div>
          </div>
        ) : null}

        {bookingLocked ? (
          <div className="rounded-md border border-border bg-surface-2 p-5 text-center">
            <WalletCards className="mx-auto h-7 w-7 text-gold" strokeWidth={1.6} />
            <h1 className="mt-4 font-section text-4xl leading-none">Calendar locked</h1>
            <p className="mx-auto mt-3 max-w-md font-body text-sm leading-relaxed text-text-muted">
              Booking reopens after the subscription balance is current.
            </p>
            <button
              type="button"
              onClick={onOpenBillingPortal}
              disabled={billingBusy}
              className="ios-pill mt-5 inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-bg disabled:cursor-not-allowed disabled:opacity-60"
            >
              <WalletCards className="h-4 w-4" />
              {billingBusy ? 'Opening' : 'Manage billing'}
            </button>
            {billingMessage ? <p className="mt-3 font-body text-xs leading-relaxed text-text-muted">{billingMessage}</p> : null}
          </div>
        ) : (
          <>
          <BillingPanel
            billing={billingSummary}
            loading={billingLoading}
            billingBusy={billingBusy}
            retryBusy={retryBusy}
            pushBusy={pushBusy}
            billingMessage={billingMessage}
            onOpenBillingPortal={onOpenBillingPortal}
            onRetryBilling={onRetryBilling}
            onEnablePushAlerts={onEnablePushAlerts}
          />
          {bookingMessage ? (
            <div className="mb-4 rounded-md border border-gold/20 bg-surface-2/80 p-4 shadow-glass">
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Booking status</p>
              <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">{bookingMessage}</p>
            </div>
          ) : null}
          <ClientPlanSummary
            appointmentPlans={appointmentPlans}
            workoutRoutines={workoutRoutines}
            onOpenWorkout={onPreviewWorkout}
          />
          <GoogleScheduler
            title={sessionTitle}
            description={sessionDescription}
            location={isOnlineCoaching ? 'Online' : 'Stryv Society Fitness'}
            durationMinutes={60}
            serviceType={serviceType}
            onBookSession={onBookSession}
          />
          </>
        )}
      </div>
    </motion.div>
  );
}

function formatBillingDate(value: string | null | undefined): string {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

function BillingPanel({
  billing,
  loading,
  billingBusy,
  retryBusy,
  pushBusy,
  billingMessage,
  onOpenBillingPortal,
  onRetryBilling,
  onEnablePushAlerts,
}: {
  billing: BillingSummary | null;
  loading: boolean;
  billingBusy: boolean;
  retryBusy: boolean;
  pushBusy: boolean;
  billingMessage: string | null;
  onOpenBillingPortal: () => void;
  onRetryBilling: () => void;
  onEnablePushAlerts: () => void;
}) {
  const dueLabel = billing?.requiresPayment ? formatBillingDate(billing.dueDate) : formatBillingDate(billing?.renewalDate);
  const dueTitle = billing?.requiresPayment ? 'Due date' : 'Renews';
  const stripeActionLabel = billing?.requiresPayment && billing.latestInvoice?.hostedInvoiceUrl ? 'Open Stripe invoice' : 'Update billing';

  return (
    <section className="mb-4 rounded-md border border-gold/20 bg-surface-2/80 p-4 shadow-glass">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Billing</p>
          <h2 className="mt-2 font-section text-3xl leading-none">
            {loading ? 'Loading billing' : billing?.planName ?? 'No monthly plan yet'}
          </h2>
          <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
            {billing?.hasBilling
              ? `${billing.statusLabel}${billing.amountLabel ? ` / ${billing.amountLabel}` : ''}`
              : 'Book a paid package or monthly coaching plan to activate billing controls.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={onOpenBillingPortal}
            disabled={billingBusy}
            className="ios-pill inline-flex min-h-10 items-center gap-2 rounded-full border border-border px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-text-muted transition hover:border-gold hover:text-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            <WalletCards className="h-4 w-4" />
            {billingBusy ? 'Opening' : stripeActionLabel}
          </button>
          {billing?.canRetry ? (
            <button
              type="button"
              onClick={onRetryBilling}
              disabled={retryBusy}
              className="ios-pill inline-flex min-h-10 items-center gap-2 rounded-full bg-gold px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-bg transition hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${retryBusy ? 'animate-spin' : ''}`} />
              {retryBusy ? 'Retrying' : 'Retry'}
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <BillingStat label={dueTitle} value={dueLabel} />
        <BillingStat label="Invoice" value={billing?.latestInvoice?.amountDueLabel ?? 'Current'} />
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onEnablePushAlerts}
          disabled={pushBusy}
          className="ios-pill inline-flex min-h-8 items-center gap-2 rounded-full border border-border px-3 font-caption text-[9px] uppercase tracking-[0.12em] text-text-muted transition hover:border-gold hover:text-gold disabled:opacity-60"
        >
          <Bell className="h-3.5 w-3.5" />
          {pushBusy ? 'Enabling' : 'Enable billing alerts'}
        </button>
      </div>

      {billing?.requiresPayment ? (
        <p className="mt-4 font-body text-xs leading-relaxed text-primary">
          Payment needs attention{billing.daysPastDue > 0 ? ` / ${billing.daysPastDue} day${billing.daysPastDue === 1 ? '' : 's'} past due` : ''}.
          {billing.bookingLocked ? ' Booking is locked until billing is current.' : ' Booking stays open while recovery is in progress.'}
        </p>
      ) : null}
      {billingMessage ? <p className="mt-3 font-body text-xs leading-relaxed text-text-muted">{billingMessage}</p> : null}
    </section>
  );
}

function BillingStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-sm border border-border/70 bg-bg/30 p-3">
      <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-text-dim">{label}</p>
      <p className="mt-1 font-body text-sm leading-snug text-text">{value}</p>
    </div>
  );
}

function formatClientDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function ClientPlanSummary({
  appointmentPlans,
  workoutRoutines,
  onOpenWorkout,
}: {
  appointmentPlans: AdminAppointmentPlan[];
  workoutRoutines: AdminWorkoutRoutine[];
  onOpenWorkout: () => void;
}) {
  const appointmentPlan = appointmentPlans[0] ?? null;
  const workoutRoutine = workoutRoutines[0] ?? null;
  if (!appointmentPlan && !workoutRoutine) return null;

  const appointmentDate = formatClientDate(appointmentPlan?.scheduledAt);

  return (
    <section className="mb-4 grid gap-3 md:grid-cols-2">
      {appointmentPlan ? (
        <article className="rounded-md border border-gold/20 bg-surface-2/80 p-4 shadow-glass">
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Coach appointment plan</p>
          <h2 className="mt-2 font-section text-3xl leading-none">{appointmentPlan.title}</h2>
          <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">{appointmentPlan.summary}</p>
          {appointmentDate ? (
            <p className="mt-3 font-caption text-[10px] uppercase tracking-[0.14em] text-text-dim">
              {appointmentDate}
              {appointmentPlan.location ? ` / ${appointmentPlan.location}` : ''}
            </p>
          ) : null}
          {appointmentPlan.preparation.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {appointmentPlan.preparation.slice(0, 3).map((item) => (
                <li key={`${appointmentPlan.id}:${item.label}`} className="font-body text-xs leading-relaxed text-text-muted">
                  <span className="text-gold">{item.completed ? 'Done' : 'Prep'}:</span> {item.label}
                  {item.detail ? ` - ${item.detail}` : ''}
                </li>
              ))}
            </ul>
          ) : null}
        </article>
      ) : null}
      {workoutRoutine ? (
        <article className="rounded-md border border-gold/20 bg-surface-2/80 p-4 shadow-glass">
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Coach workout plan</p>
          <h2 className="mt-2 font-section text-3xl leading-none">{workoutRoutine.title}</h2>
          <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">{workoutRoutine.summary}</p>
          {workoutRoutine.blocks.length > 0 ? (
            <p className="mt-3 font-caption text-[10px] uppercase tracking-[0.14em] text-text-dim">
              {workoutRoutine.blocks.length} training block{workoutRoutine.blocks.length === 1 ? '' : 's'} ready
            </p>
          ) : null}
          <button
            type="button"
            onClick={onOpenWorkout}
            className="ios-pill mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-gold px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-bg transition hover:bg-gold-deep"
          >
            Open workout plan <Dumbbell className="h-4 w-4" />
          </button>
        </article>
      ) : null}
    </section>
  );
}

function blocksForRoutine(routine: AdminWorkoutRoutine | null): DisplayWorkoutBlock[] {
  if (!routine || routine.blocks.length === 0) return workoutBlocks;
  return routine.blocks.map((block, index) => ({
    name: block.name,
    detail: block.detail,
    description: block.detail || routine.summary,
    demo: routine.selectedExercises[index]?.name ?? routine.title,
    sets: ['Set 1', 'Set 2', 'Set 3'],
    minutes: 12,
  }));
}

function WorkoutPhase({
  remote,
  routine,
  complete,
  onComplete,
  onAdvance,
}: {
  remote: boolean;
  routine: AdminWorkoutRoutine | null;
  complete: boolean;
  onComplete: () => void;
  onAdvance: () => void;
}) {
  const displayBlocks = useMemo(() => blocksForRoutine(routine), [routine]);
  const [expandedBlock, setExpandedBlock] = useState(displayBlocks[0].name);
  const [setProgress, setSetProgress] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(displayBlocks.map((block) => [block.name, block.sets.map(() => false)]))
  );
  const activeBlock = displayBlocks.find((block) => block.name === expandedBlock) ?? displayBlocks[0];
  const activeSetProgress = setProgress[activeBlock.name] ?? activeBlock.sets.map(() => false);
  const completedSets = activeSetProgress.filter(Boolean).length;

  useEffect(() => {
    if (!displayBlocks.some((block) => block.name === expandedBlock)) {
      setExpandedBlock(displayBlocks[0].name);
    }
    setSetProgress((current) => {
      const next = { ...current };
      for (const block of displayBlocks) {
        if (!next[block.name]) next[block.name] = block.sets.map(() => false);
      }
      return next;
    });
  }, [displayBlocks, expandedBlock]);

  function toggleWorkoutSet(blockName: string, setIndex: number) {
    setSetProgress((current) => {
      const block = displayBlocks.find((item) => item.name === blockName);
      const existing = current[blockName] ?? block?.sets.map(() => false) ?? [];
      return {
        ...current,
        [blockName]: existing.map((value, index) => (index === setIndex ? !value : value)),
      };
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -22 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="space-y-6 py-8 snap-y snap-mandatory"
    >
      <section className="min-h-[calc(100dvh-128px)] snap-start rounded-md border border-gold/20 bg-surface-2/80 p-4 shadow-glass sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
              {routine ? 'Coach-published workout' : remote ? 'Live remote workout' : 'Guided workout'}
            </p>
            <h1 className="mt-3 font-section text-5xl leading-none sm:text-6xl">
              {routine ? routine.title : 'Today&apos;s lift'}
            </h1>
            {routine ? <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">{routine.summary}</p> : null}
          </div>
          {remote ? (
            <div className="relative mt-2 flex min-w-12 justify-center pt-4">
              <span className="absolute left-1/2 top-0 -translate-x-1/2 font-caption text-[8px] uppercase tracking-[0.12em] text-gold">
                Remote
              </span>
              <Video className="h-5 w-5 text-gold" strokeWidth={1.7} />
            </div>
          ) : null}
        </div>

        <div className="mt-7">
          {displayBlocks.map((block, index) => (
            <motion.article
              key={block.name}
              initial={{ opacity: 0, x: -18 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.08, duration: 0.38 }}
              className="relative py-4 before:absolute before:inset-x-1 before:top-0 before:h-px before:bg-[linear-gradient(to_right,transparent,rgba(242,79,9,0.28),transparent)] first:before:hidden"
            >
              <button
                type="button"
                onClick={() => setExpandedBlock(block.name)}
                className="group grid w-full grid-cols-[40px_1fr_auto] items-center gap-3 text-left"
              >
                <div className="relative flex h-10 w-10 items-center justify-center rounded-md bg-gold/90 text-bg shadow-[0_0_24px_rgba(242,79,9,0.22)]">
                  <span className="absolute inset-0 rounded-md bg-[linear-gradient(90deg,rgba(255,255,255,0.24),transparent_62%)]" />
                  <span className="relative font-headline text-base">{index + 1}</span>
                </div>
                <div className="min-w-0">
                  <h2 className="font-headline text-lg uppercase">{block.name}</h2>
                  <p className="mt-1 font-body text-xs leading-relaxed text-text-muted">{block.detail}</p>
                </div>
                <div className="flex items-center gap-2">
                  <p className="font-caption text-[10px] uppercase tracking-[0.12em] text-text-dim">
                    {block.minutes}m
                  </p>
                  <ChevronDown
                    className={`h-4 w-4 text-gold transition-transform ${expandedBlock === block.name ? 'rotate-180' : ''}`}
                    strokeWidth={1.8}
                  />
                </div>
              </button>
              <AnimatePresence initial={false}>
                {expandedBlock === block.name ? (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden pl-[52px] pr-8 pt-3"
                  >
                    <p className="font-body text-sm leading-relaxed text-text-muted">{block.description}</p>
                    <p className="mt-2 font-caption text-[9px] uppercase tracking-[0.14em] text-gold">
                      Scroll for demo and set tracker
                    </p>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </motion.article>
          ))}
        </div>

        <button
          type="button"
          onClick={complete ? onAdvance : onComplete}
          className="ios-pill mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-gold px-4 font-control text-sm font-semibold uppercase tracking-[0.08em] text-bg transition hover:bg-gold-deep"
        >
          {complete ? 'Swipe or continue' : 'Mark workout done'} {complete ? <ChevronRight /> : <Check />}
        </button>
        <div className="mt-4 flex items-center justify-center">
          <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">
            Scroll down for {activeBlock.name.toLowerCase()} demo
          </p>
        </div>
      </section>

      <section className="flex min-h-[calc(100dvh-128px)] snap-start flex-col justify-center py-6">
        <div className="rounded-md border border-gold/20 bg-surface-2/80 p-4 shadow-glass sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Workout demo</p>
              <h2 className="mt-2 font-section text-4xl leading-none">{activeBlock.name}</h2>
              <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">{activeBlock.demo}</p>
            </div>
            <div className="rounded-full bg-bg/70 px-3 py-2 text-right">
              <p className="font-caption text-[8px] uppercase tracking-[0.12em] text-text-dim">Sets</p>
              <p className="font-headline text-sm text-gold">
                {completedSets}/{activeBlock.sets.length}
              </p>
            </div>
          </div>

          <div className="mt-5 overflow-hidden rounded-lg bg-[linear-gradient(135deg,#05090c,#101b22)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),0_18px_44px_rgba(0,0,0,0.22)]">
            <div className="relative flex aspect-video items-center justify-center">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(242,79,9,0.24),transparent_42%),linear-gradient(145deg,rgba(255,255,255,0.05),transparent_52%)]" />
              <div className="relative text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gold text-bg shadow-[0_0_40px_rgba(242,79,9,0.42)]">
                  <Play className="ml-1 h-7 w-7 fill-current" strokeWidth={1.8} />
                </div>
                <p className="mt-4 font-caption text-[10px] uppercase tracking-[0.16em] text-white/70">
                  Demo video
                </p>
              </div>
            </div>
          </div>

          <p className="mt-5 font-body text-sm leading-relaxed text-text-muted">{activeBlock.description}</p>

          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-5">
            {activeBlock.sets.map((setLabel, index) => {
              const isDone = activeSetProgress[index];
              return (
                <button
                  key={setLabel}
                  type="button"
                  onClick={() => toggleWorkoutSet(activeBlock.name, index)}
                  className={`ios-pill min-h-11 rounded-full px-3 font-caption text-[10px] uppercase tracking-[0.12em] transition ${
                    isDone
                      ? 'bg-gold text-bg shadow-[0_0_20px_rgba(242,79,9,0.24)]'
                      : 'border border-border bg-bg/70 text-text-muted hover:border-gold/50 hover:text-gold'
                  }`}
                >
                  {isDone ? 'Done ' : ''}
                  {setLabel}
                </button>
              );
            })}
          </div>
        </div>
      </section>
    </motion.div>
  );
}

function PhaseFrame({
  title,
  icon,
  children,
  onAdvance,
  advanceLabel,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
  onAdvance: () => void;
  advanceLabel: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 22 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -22 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className="py-8"
    >
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-md bg-gold text-bg">{icon}</span>
          <h1 className="font-section text-5xl leading-none">{title}</h1>
        </div>
        <button
          type="button"
          onClick={onAdvance}
          className="ios-pill hidden min-h-11 items-center gap-2 rounded-full border border-border px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-text-muted transition hover:border-gold hover:text-gold sm:inline-flex"
        >
          {advanceLabel} <ChevronRight className="h-4 w-4" />
        </button>
      </div>
      {children}
    </motion.div>
  );
}

function JournalPhase() {
  const [entries, setEntries] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem('stryvfit-journal-draft');
      if (!stored) return;
      const parsed = JSON.parse(stored) as { entries?: Record<string, string>; savedAt?: string };
      setEntries(parsed.entries ?? {});
      setSavedAt(parsed.savedAt ?? null);
    } catch {
      // Ignore corrupted local drafts.
    }
  }, []);

  function updateEntry(prompt: string, value: string) {
    setEntries((current) => ({ ...current, [prompt]: value }));
    setSavedAt(null);
  }

  function saveJournal() {
    const nextSavedAt = new Date().toISOString();
    window.localStorage.setItem('stryvfit-journal-draft', JSON.stringify({ entries, savedAt: nextSavedAt }));
    setSavedAt(nextSavedAt);
  }

  return (
    <PhaseFrame
      title="Journal"
      icon={<NotebookPen className="h-5 w-5" />}
      onAdvance={saveJournal}
      advanceLabel="Save journal"
    >
      {savedAt ? (
        <p className="mb-4 rounded-md border border-gold/20 bg-surface-2 p-3 font-body text-sm text-text-muted">
          Journal saved on this device for your next check-in.
        </p>
      ) : null}
      <section className="grid gap-4 rounded-md border border-border bg-surface-2 p-4 shadow-glass md:grid-cols-3">
        {journalPrompts.map((prompt) => (
          <label key={prompt} className="block rounded-md border border-border bg-bg/70 p-4">
            <span className="font-caption text-[10px] uppercase tracking-[0.14em] text-gold">{prompt}</span>
            <textarea
              value={entries[prompt] ?? ''}
              onChange={(event) => updateEntry(prompt, event.target.value)}
              className="mt-4 min-h-36 w-full resize-none bg-transparent font-body text-sm leading-relaxed text-text outline-none placeholder:text-text-dim"
              placeholder="Type a quick note"
            />
          </label>
        ))}
      </section>
    </PhaseFrame>
  );
}

function FloatingMenu({
  open,
  onOpenChange,
  onSelect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (phase: Phase) => void;
}) {
  const items: { phase: Phase; label: string; icon: ReactNode }[] = [
    { phase: 'calendar', label: 'Calendar', icon: <CalendarDays className="h-4 w-4" /> },
    { phase: 'journal', label: 'Journal', icon: <NotebookPen className="h-4 w-4" /> },
  ];

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end pb-[env(safe-area-inset-bottom)]">
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 14, scale: 0.96 }}
            className="mb-3 w-56 rounded-lg border border-gold/15 bg-surface-2/95 px-3 py-2 shadow-glass backdrop-blur-glass"
          >
            {items.map((item) => (
              <button
                key={item.phase}
                type="button"
                onClick={() => onSelect(item.phase)}
                className="relative flex min-h-11 w-full items-center gap-3 px-1 font-caption text-[10px] uppercase tracking-[0.14em] text-text-muted transition hover:text-gold before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-[linear-gradient(to_right,transparent,rgba(242,79,9,0.28),transparent)] first:before:hidden"
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
      <motion.button
        type="button"
        aria-label={open ? 'Close phase menu' : 'Open phase menu'}
        onClick={() => onOpenChange(!open)}
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}
        className="ios-pill relative flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-gold/30 bg-gold/80 text-bg shadow-[0_0_24px_rgba(242,79,9,0.26)] transition active:scale-95"
      >
        <AnimatePresence mode="wait" initial={false}>
          <motion.span
            key={open ? 'close' : 'menu'}
            initial={{ opacity: 0, scale: 0.72, rotate: -90 }}
            animate={{ opacity: 1, scale: 1, rotate: 0 }}
            exit={{ opacity: 0, scale: 0.72, rotate: 90 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="relative z-10"
          >
            {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </motion.span>
        </AnimatePresence>
      </motion.button>
    </div>
  );
}

function PaymentModal({
  onClose,
  bookingLocked,
  billingBusy,
  retryBusy,
  billingSummary,
  billingMessage,
  onOpenBillingPortal,
  onRetryBilling,
}: {
  onClose: () => void;
  bookingLocked: boolean;
  billingBusy: boolean;
  retryBusy: boolean;
  billingSummary: BillingSummary | null;
  billingMessage: string | null;
  onOpenBillingPortal: () => void;
  onRetryBilling: () => void;
}) {
  const hostedInvoice = billingSummary?.requiresPayment ? billingSummary.latestInvoice?.hostedInvoiceUrl : null;
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[60] flex items-end bg-black/62 p-4 backdrop-blur-sm sm:items-center sm:justify-center"
    >
      <motion.section
        initial={{ y: 28, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 28, scale: 0.98 }}
        className="w-full max-w-md rounded-lg border border-gold/25 bg-surface-2 p-5 shadow-glass-lg"
      >
        <WalletCards className="h-7 w-7 text-gold" strokeWidth={1.6} />
        <h2 className="mt-4 font-section text-4xl leading-none">{hostedInvoice ? 'Pay Stripe invoice' : 'Update payment'}</h2>
        <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
          We only surface this during the phase change. {bookingLocked ? 'Booking is paused until the balance is current.' : 'Your next phase unlocks once the balance is current.'}
          {billingSummary?.latestInvoice?.amountDueLabel ? ` Amount due: ${billingSummary.latestInvoice.amountDueLabel}.` : ''}
        </p>
        {billingMessage ? <p className="mt-3 font-body text-xs leading-relaxed text-text-muted">{billingMessage}</p> : null}
        <div className={`mt-5 grid gap-2 ${hostedInvoice ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <button
            type="button"
            onClick={onOpenBillingPortal}
            disabled={billingBusy}
            className="ios-pill min-h-11 rounded-full bg-gold px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-bg disabled:cursor-not-allowed disabled:opacity-60"
          >
            {billingBusy ? 'Opening' : hostedInvoice ? 'Open Stripe invoice' : 'Update Billing'}
          </button>
          {!hostedInvoice ? (
            <button
              type="button"
              onClick={onRetryBilling}
              disabled={retryBusy || !billingSummary?.canRetry}
              className="ios-pill min-h-11 rounded-full border border-gold/40 px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-gold disabled:cursor-not-allowed disabled:opacity-60"
            >
              {retryBusy ? 'Retrying' : 'Retry'}
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="ios-pill min-h-11 rounded-full border border-border px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-text-muted"
          >
            Later
          </button>
        </div>
      </motion.section>
    </motion.div>
  );
}

function BillingRecoveryToast({
  billing,
  billingBusy,
  retryBusy,
  onOpenBillingPortal,
  onRetryBilling,
}: {
  billing: BillingSummary;
  billingBusy: boolean;
  retryBusy: boolean;
  onOpenBillingPortal: () => void;
  onRetryBilling: () => void;
}) {
  const hostedInvoice = billing.requiresPayment ? billing.latestInvoice?.hostedInvoiceUrl : null;
  return (
    <motion.aside
      initial={{ opacity: 0, y: 18, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 18, scale: 0.98 }}
      className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[55] mx-auto max-w-md"
      aria-live="polite"
    >
      <div className="rounded-[22px] border border-gold/30 bg-[#111111]/94 px-4 py-3 shadow-[0_22px_48px_rgba(0,0,0,0.38),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
        <div className="flex items-start gap-3">
          <CreditCard className="mt-1 h-5 w-5 flex-none text-gold" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Payment needs attention</p>
            <p className="mt-1 font-body text-xs leading-relaxed text-text-muted">
              {billing.latestInvoice?.amountDueLabel
                ? `${billing.latestInvoice.amountDueLabel} is due in Stripe.`
                : 'Your monthly subscription needs a billing update.'}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onOpenBillingPortal}
                disabled={billingBusy}
                className="ios-pill inline-flex min-h-9 items-center justify-center rounded-full bg-gold px-4 font-control text-[11px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-gold-deep disabled:opacity-60"
              >
                {billingBusy ? 'Opening' : hostedInvoice ? 'Open Stripe invoice' : 'Update Billing'}
              </button>
              {!hostedInvoice ? (
                <button
                  type="button"
                  onClick={onRetryBilling}
                  disabled={retryBusy || !billing.canRetry}
                  className="ios-pill inline-flex min-h-9 items-center justify-center rounded-full border border-gold/40 px-4 font-control text-[11px] font-semibold uppercase tracking-[0.08em] text-gold transition-colors hover:border-gold disabled:opacity-60"
                >
                  {retryBusy ? 'Retrying' : 'Retry'}
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </motion.aside>
  );
}
