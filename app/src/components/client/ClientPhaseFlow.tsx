'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Dumbbell,
  Menu,
  NotebookPen,
  Play,
  Salad,
  Video,
  WalletCards,
  X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ReactNode, TouchEvent } from 'react';
import { GoogleScheduler, type SchedulerBookingDraft } from '@/components/scheduling/GoogleScheduler';
import { MealPrepPlanner } from '@/components/meals/MealPrepPlanner';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { BrandWordmark } from '@/components/BrandWordmark';
import { ThemeToggle, usePersistedTheme } from '@/components/ui/ThemeToggle';
import { parseBookingService, type BookingServiceType } from '@/lib/bookingServices';

type Phase = 'calendar' | 'workout' | 'meal-prep' | 'journal';
type SessionMode = 'none' | 'remote' | 'in-person';

const workoutBlocks = [
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

type WorkoutBlock = (typeof workoutBlocks)[number];

const journalPrompts = [
  'What felt strongest today?',
  'Where did form need the most attention?',
  'What meal would make tomorrow easier?',
];

const paymentNoticeDays = [-1, 1, 3, 5, 7];

function getPaymentState(daysFromDue: number) {
  return {
    daysFromDue,
    requiresPayment: paymentNoticeDays.includes(daysFromDue),
    bookingLocked: daysFromDue >= 7,
  };
}

function useClientQueryState(): {
  sessionMode: SessionMode;
  daysFromDue: number;
  serviceType: BookingServiceType;
  bookingStatus: string | null;
} {
  const [mode, setMode] = useState<SessionMode>('none');
  const [daysFromDue, setDaysFromDue] = useState(0);
  const [serviceType, setServiceType] = useState<BookingServiceType>('free');
  const [bookingStatus, setBookingStatus] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get('session');
    const due = Number(params.get('pastDueDays') ?? 0);
    setMode(requested === 'remote' || requested === 'in-person' ? requested : 'none');
    setDaysFromDue(Number.isFinite(due) ? due : 0);
    setServiceType(parseBookingService(params.get('service')));
    setBookingStatus(params.get('booking'));
  }, []);

  return { sessionMode: mode, daysFromDue, serviceType, bookingStatus };
}

export function ClientPhaseFlow() {
  const { sessionMode, daysFromDue, serviceType, bookingStatus } = useClientQueryState();
  const paymentState = useMemo(() => getPaymentState(daysFromDue), [daysFromDue]);
  const hasSession = sessionMode !== 'none';
  const [phase, setPhase] = useState<Phase>('calendar');
  const [menuOpen, setMenuOpen] = useState(false);
  const [countdown, setCountdown] = useState(12);
  const [workoutComplete, setWorkoutComplete] = useState(false);
  const [deliberating, setDeliberating] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [bookingMessage, setBookingMessage] = useState<string | null>(() => {
    if (bookingStatus === 'success') return 'Payment received. We are confirming your calendar event.';
    if (bookingStatus === 'confirmed') return 'You are booked. Your calendar confirmation is on the way.';
    if (bookingStatus === 'cancelled') return 'Checkout was cancelled. Your time was released.';
    return null;
  });
  const [theme, setTheme] = usePersistedTheme('stryvfit-theme', 'dark');
  const touchStart = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!hasSession || countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, hasSession]);

  useEffect(() => {
    if (hasSession && countdown === 0) setPhase('workout');
  }, [countdown, hasSession]);

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

  function handleAdvance(next: Phase = phase === 'workout' ? 'meal-prep' : 'journal') {
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
      window.location.assign(payload.checkoutUrl);
      return;
    }

    if (payload.redirectUrl) {
      if (!res.ok) {
        window.location.assign(payload.redirectUrl);
        return;
      }
      window.history.replaceState(null, '', payload.redirectUrl);
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

  function onTouchEnd(event: TouchEvent<HTMLDivElement>) {
    if (!touchStart.current) return;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.current.x;
    const dy = touch.clientY - touchStart.current.y;
    touchStart.current = null;
    if ((dx > 72 || dy > 72) && (phase === 'workout' || phase === 'meal-prep')) {
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
          ) : phase === 'workout' && countdown === 0 ? (
            <WorkoutPhase
              key="workout"
              remote={sessionMode === 'remote'}
              complete={workoutComplete}
              onComplete={() => setWorkoutComplete(true)}
              onAdvance={() => handleAdvance('meal-prep')}
            />
          ) : phase === 'meal-prep' ? (
            <PhaseFrame
              key="meal"
              title="Meal prep"
              icon={<Salad className="h-5 w-5" />}
              onAdvance={() => handleAdvance('journal')}
              advanceLabel="Continue to journal"
            >
              <MealPrepPlanner />
            </PhaseFrame>
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
              onPreviewWorkout={() => countdown === 0 && setPhase('workout')}
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
          if (next === 'meal-prep' || next === 'journal') deliberateNext(next);
          else setPhase(next);
        }}
      />

      <AnimatePresence>
        {paymentOpen ? (
          <PaymentModal onClose={() => setPaymentOpen(false)} bookingLocked={paymentState.bookingLocked} />
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
  onPreviewWorkout,
  onBookSession,
}: {
  hasSession: boolean;
  countdown: number;
  bookingLocked: boolean;
  serviceType: BookingServiceType;
  bookingMessage: string | null;
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
                disabled={countdown > 0}
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
          </div>
        ) : (
          <>
          {bookingMessage ? (
            <div className="mb-4 rounded-md border border-gold/20 bg-surface-2/80 p-4 shadow-glass">
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">Booking status</p>
              <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">{bookingMessage}</p>
            </div>
          ) : null}
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

function WorkoutPhase({
  remote,
  complete,
  onComplete,
  onAdvance,
}: {
  remote: boolean;
  complete: boolean;
  onComplete: () => void;
  onAdvance: () => void;
}) {
  const [expandedBlock, setExpandedBlock] = useState(workoutBlocks[0].name);
  const [setProgress, setSetProgress] = useState<Record<string, boolean[]>>(() =>
    Object.fromEntries(workoutBlocks.map((block) => [block.name, block.sets.map(() => false)]))
  );
  const activeBlock = workoutBlocks.find((block) => block.name === expandedBlock) ?? workoutBlocks[0];
  const activeSetProgress = setProgress[activeBlock.name] ?? activeBlock.sets.map(() => false);
  const completedSets = activeSetProgress.filter(Boolean).length;

  function toggleWorkoutSet(blockName: string, setIndex: number) {
    setSetProgress((current) => {
      const block = workoutBlocks.find((item) => item.name === blockName);
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
              {remote ? 'Live remote workout' : 'Guided workout'}
            </p>
            <h1 className="mt-3 font-section text-5xl leading-none sm:text-6xl">Today&apos;s lift</h1>
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
          {workoutBlocks.map((block, index) => (
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
  return (
    <PhaseFrame
      title="Journal"
      icon={<NotebookPen className="h-5 w-5" />}
      onAdvance={() => {}}
      advanceLabel="Complete"
    >
      <section className="grid gap-4 rounded-md border border-border bg-surface-2 p-4 shadow-glass md:grid-cols-3">
        {journalPrompts.map((prompt) => (
          <label key={prompt} className="block rounded-md border border-border bg-bg/70 p-4">
            <span className="font-caption text-[10px] uppercase tracking-[0.14em] text-gold">{prompt}</span>
            <textarea
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
    { phase: 'meal-prep', label: 'Meal prep', icon: <Salad className="h-4 w-4" /> },
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

function PaymentModal({ onClose, bookingLocked }: { onClose: () => void; bookingLocked: boolean }) {
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
        <h2 className="mt-4 font-section text-4xl leading-none">Update payment</h2>
        <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
          We only surface this during the phase change. {bookingLocked ? 'Booking is paused until the balance is current.' : 'Your next phase unlocks once the balance is current.'}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => window.location.assign('/book?service=sessions_4')}
            className="ios-pill min-h-11 rounded-full bg-gold px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-bg"
          >
            Pay now
          </button>
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
