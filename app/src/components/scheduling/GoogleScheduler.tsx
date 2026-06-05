'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Lock,
  Plus,
  ShieldCheck,
  Unlock,
  X,
} from 'lucide-react';
import { combineDateAndTime, googleCalendarEventUrl } from '@/lib/googleCalendar';
import type { BookingServiceType } from '@/lib/bookingServices';
import { reportIncident } from '@/lib/reportIncident';
import { BOOKING_CONSENT_FORM_URL, bookingRequiresConsent } from '@/lib/bookingConsent';
import {
  buildAvailableTimes,
  combineBookingTzDateAndTime,
  DEFAULT_BOOKING_AVAILABILITY,
  formatCalendarDateKey,
  normalizeStartTimes,
  parseBookingAvailability,
  toggleBlockedSlot,
  type BookingAvailability,
} from '@/lib/bookingAvailability';

const durationOptions = [30, 60];

type RemoteSlot = {
  time: string;
  available: boolean;
  reason: string | null;
};

export type SchedulerBookingDraft = {
  serviceType: BookingServiceType;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  title: string;
  description: string;
  consentAcknowledged?: boolean;
};

function normalizeDuration(durationMinutes: number): number {
  return durationOptions.includes(durationMinutes) ? durationMinutes : durationOptions[0];
}

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function bookableStartDate(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  today.setDate(today.getDate() + 1);
  return today;
}

function isBeforeBookableStart(date: Date): boolean {
  return date < bookableStartDate();
}

function firstBookableDate(days: Date[]): Date {
  return days.find((date) => !isBeforeBookableStart(date)) ?? days[0];
}

function buildDateCycle(cycleIndex: number): { days: Date[]; label: string; eyebrow: string } {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const monthStart = addMonths(new Date(today.getFullYear(), today.getMonth(), 1), cycleIndex);
  const daysInMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => {
    const date = new Date(monthStart);
    date.setDate(index + 1);
    return date;
  });

  return {
    days,
    label: new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(monthStart),
    eyebrow: cycleIndex === 0 ? 'Current month' : 'Full month',
  };
}

function formatDay(date: Date): { weekday: string; day: string; month: string } {
  return {
    weekday: new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(date),
    day: new Intl.DateTimeFormat('en-US', { day: '2-digit' }).format(date),
    month: new Intl.DateTimeFormat('en-US', { month: 'short' }).format(date),
  };
}

function formatFullDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

function formatTime(time: string): string {
  const [hours, minutes] = time.split(':').map(Number);
  const date = new Date();
  date.setHours(hours, minutes, 0, 0);
  return new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(date);
}

export function GoogleScheduler({
  title,
  description,
  durationMinutes = 45,
  location = 'Stryv Society Fitness',
  context,
  serviceType = 'free',
  variant = 'card',
  onBookSession,
  manageAvailability = false,
}: {
  title: string;
  description: string;
  durationMinutes?: number;
  location?: string;
  context?: string;
  serviceType?: BookingServiceType;
  variant?: 'card' | 'timeline';
  onBookSession?: (draft: SchedulerBookingDraft) => Promise<void> | void;
  manageAvailability?: boolean;
}) {
  const [availability, setAvailability] = useState<BookingAvailability>(DEFAULT_BOOKING_AVAILABILITY);
  const [selectedDuration, setSelectedDuration] = useState(() => normalizeDuration(durationMinutes));
  const [cycleIndex, setCycleIndex] = useState(0);
  const cycle = useMemo(() => buildDateCycle(cycleIndex), [cycleIndex]);
  const days = cycle.days;
  const [selectedDate, setSelectedDate] = useState(() => firstBookableDate(days));
  const times = useMemo(() => buildAvailableTimes(availability, selectedDuration), [availability, selectedDuration]);
  const [selectedTime, setSelectedTime] = useState(times[0]);
  const [mockBooked, setMockBooked] = useState(false);
  const [bookingPending, setBookingPending] = useState(false);
  const [bookingError, setBookingError] = useState<string | null>(null);
  const [consentAcknowledged, setConsentAcknowledged] = useState(false);
  const [remoteSlots, setRemoteSlots] = useState<RemoteSlot[] | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const selectedDateKey = formatCalendarDateKey(selectedDate);
  const bookingCtaLabel = serviceType === 'free' ? 'Claim Free Session' : 'Book Session';
  const requiresConsent = bookingRequiresConsent(serviceType);
  const blockedTimes = useMemo(
    () => availability.blockedSlots[selectedDateKey] ?? [],
    [availability.blockedSlots, selectedDateKey]
  );
  const displayTimes = remoteSlots?.map((slot) => slot.time) ?? times;
  const selectedTimeBlocked = blockedTimes.includes(selectedTime);
  const bookingButtonLabel = slotsLoading
    ? 'Loading Times'
    : bookingPending
      ? 'Checking Slot'
      : mockBooked
        ? 'Session Booked'
        : bookingCtaLabel;
  const bookingButtonSubtext = mockBooked
    ? 'Confirmation started'
    : requiresConsent && !consentAcknowledged
      ? 'Consent required'
      : serviceType === 'free'
        ? 'No card required'
        : 'Secure checkout';

  useEffect(() => {
    if (!manageAvailability) return;
    let cancelled = false;

    async function loadTrainerRules() {
      try {
        const res = await fetch('/api/admin/booking-availability');
        const data = (await res.json()) as { availability?: unknown };
        if (!cancelled && data.availability) {
          setAvailability(parseBookingAvailability(data.availability));
        }
      } catch {
        // keep defaults
      }
    }

    void loadTrainerRules();
    return () => {
      cancelled = true;
    };
  }, [manageAvailability]);

  useEffect(() => {
    if (!onBookSession || manageAvailability) {
      setRemoteSlots(null);
      return;
    }

    let cancelled = false;

    async function loadSlots() {
      setSlotsLoading(true);
      try {
        const res = await fetch(
          `/api/bookings/availability?date=${formatCalendarDateKey(selectedDate)}&durationMinutes=${selectedDuration}`
        );
        const data = (await res.json()) as { times?: RemoteSlot[]; availability?: unknown };
        if (!cancelled) {
          if (data.availability) {
            setAvailability(parseBookingAvailability(data.availability));
          }
          setRemoteSlots(Array.isArray(data.times) ? data.times : null);
        }
      } catch {
        if (!cancelled) setRemoteSlots(null);
      } finally {
        if (!cancelled) setSlotsLoading(false);
      }
    }

    void loadSlots();
    return () => {
      cancelled = true;
    };
  }, [manageAvailability, onBookSession, selectedDate, selectedDuration]);

  const isSlotSelectable = useCallback(
    (time: string): boolean => {
      if (manageAvailability) return true;
      const remote = remoteSlots?.find((slot) => slot.time === time);
      if (remote) return remote.available;
      return !blockedTimes.includes(time);
    },
    [blockedTimes, manageAvailability, remoteSlots]
  );

  useEffect(() => {
    const nextAvailable = displayTimes.find((time) => isSlotSelectable(time)) ?? displayTimes[0];
    if (!displayTimes.includes(selectedTime) || !isSlotSelectable(selectedTime)) {
      setSelectedTime(nextAvailable);
    }
  }, [displayTimes, isSlotSelectable, selectedTime]);

  async function persistAvailability(next: BookingAvailability) {
    if (!manageAvailability) return;
    await fetch('/api/admin/booking-availability', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ availability: next }),
    });
  }

  function updateAvailability(patch: Partial<BookingAvailability>) {
    const next = { ...availability, ...patch };
    setAvailability(next);
    void persistAvailability(next);
  }

  function toggleSelectedBlock() {
    const next = toggleBlockedSlot(availability, selectedDate, selectedTime);
    setAvailability(next);
    void persistAvailability(next);
  }

  const goToCycle = (nextCycle: number) => {
    const safeCycle = Math.max(0, nextCycle);
    const next = buildDateCycle(safeCycle);
    setCycleIndex(safeCycle);
    setSelectedDate(firstBookableDate(next.days));
  };

  const eventUrl = useMemo(() => {
    try {
      const start = combineDateAndTime(selectedDate, selectedTime);
      const end = new Date(start.getTime() + selectedDuration * 60 * 1000);
      return googleCalendarEventUrl({
        title,
        details: [description, context].filter(Boolean).join('\n\n'),
        start,
        end,
        location,
      });
    } catch (error) {
      void reportIncident({
        source: 'google-calendar',
        severity: 'high',
        message: error instanceof Error ? error.message : 'Google Calendar event URL generation failed',
        stack: error instanceof Error ? error.stack : undefined,
        context: { title, durationMinutes: selectedDuration, selectedTime },
        admin_action: 'Auto-filed from themed Google scheduler.',
      });
      return 'https://calendar.google.com/calendar/render?action=TEMPLATE';
    }
  }, [context, description, location, selectedDate, selectedDuration, selectedTime, title]);

  async function bookSelectedSession() {
    if (!onBookSession || bookingPending) return;
    if (requiresConsent && !consentAcknowledged) {
      setBookingError('Open the consent form and acknowledge it before booking.');
      return;
    }
    if (!isSlotSelectable(selectedTime)) {
      setBookingError('That time is no longer available. Pick another block.');
      return;
    }
    const start = combineBookingTzDateAndTime(formatCalendarDateKey(selectedDate), selectedTime);
    const end = new Date(start.getTime() + selectedDuration * 60 * 1000);

    setBookingPending(true);
    setBookingError(null);
    try {
      await onBookSession({
        serviceType,
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        durationMinutes: selectedDuration,
        title,
        description: [description, context].filter(Boolean).join('\n\n'),
        consentAcknowledged: requiresConsent ? consentAcknowledged : undefined,
      });
      setMockBooked(true);
    } catch (error) {
      setBookingError(error instanceof Error ? error.message : 'Booking failed');
    } finally {
      setBookingPending(false);
    }
  }

  if (variant === 'timeline') {
    const selectedLabel = formatFullDate(selectedDate);

    return (
      <section className="rounded-md border border-[#dedbd4] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#f24f09]">
              Schedule
            </p>
            <h2 className="mt-1 font-section text-4xl leading-none tracking-normal text-[#151515]">
              Sprint timeline
            </h2>
            <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-[#66615a]">
              Map appointment blocks, client check-ins, and publishing windows before sending them to Google Calendar.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-[auto_auto]">
            <label className="px-1 py-1 text-right">
              <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-[#817b72]">Duration</p>
              <select
                value={selectedDuration}
                onChange={(event) => setSelectedDuration(Number(event.target.value))}
                className="mt-1 bg-transparent font-headline text-lg uppercase text-[#151515] outline-none"
              >
                {durationOptions.map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes}m
                  </option>
                ))}
              </select>
            </label>
            <a
              href={eventUrl}
              target="_blank"
              rel="noreferrer"
              className="group relative inline-flex min-h-12 items-center justify-center gap-2 overflow-hidden rounded-md border border-[#f24f09] bg-transparent px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-[#151515]"
            >
              <span className="absolute inset-0 origin-left scale-x-0 bg-[#f24f09] transition-transform duration-300 ease-out group-hover:scale-x-100" />
              <span className="relative z-10 inline-flex items-center gap-2 transition-colors group-hover:text-white">
                Add to Calendar <ExternalLink className="h-4 w-4" strokeWidth={1.7} />
              </span>
            </a>
          </div>
        </div>

        <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_300px]">
          <div className="min-w-0 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-[#817b72]">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-[#f24f09]" strokeWidth={1.7} />
                <div>
                  <p className="font-caption text-[10px] uppercase tracking-[0.16em]">Sprint dates</p>
                  <p className="mt-1 font-body text-xs text-[#66615a]">
                    <span className="font-semibold text-[#151515]">{cycle.label}</span> · {cycle.eyebrow}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToCycle(cycleIndex - 1)}
                  disabled={cycleIndex === 0}
                  aria-label="Previous calendar cycle"
                  className="ios-pill flex h-9 w-9 items-center justify-center rounded-full border border-[#dedbd4] bg-white text-[#151515] disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
                </button>
                <button
                  type="button"
                  onClick={() => goToCycle(cycleIndex + 1)}
                  aria-label="Next calendar cycle"
                  className="ios-pill flex h-9 w-9 items-center justify-center rounded-full border border-[#f24f09]/35 bg-white text-[#f24f09]"
                >
                  <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
            </div>
            <div className="overflow-x-auto pb-2">
              <div
                className="grid gap-2"
                style={{
                  gridTemplateColumns: `repeat(${days.length}, minmax(74px, 1fr))`,
                  minWidth: `${days.length * 86}px`,
                }}
              >
                {days.map((date, index) => {
                  const isSelected = date.toDateString() === selectedDate.toDateString();
                  const isPast = !manageAvailability && isBeforeBookableStart(date);
                  const label = formatDay(date);
                  return (
                    <button
                      key={date.toISOString()}
                      type="button"
                      onClick={() => setSelectedDate(date)}
                      disabled={isPast}
                      className={`relative min-h-[116px] overflow-hidden rounded-md border p-3 text-left transition-all duration-300 ${
                        isSelected
                          ? 'border-[#f24f09] bg-[radial-gradient(circle_at_50%_18%,rgba(242,79,9,0.24),rgba(255,255,255,0)_58%),#fffaf6] text-[#f24f09] shadow-[0_0_0_1px_rgba(242,79,9,0.28),0_0_26px_rgba(242,79,9,0.34),inset_0_1px_0_rgba(255,255,255,0.82)]'
                          : isPast
                            ? 'border-[#dedbd4] bg-[#eeeae4] text-[#aaa39a] opacity-45'
                            : 'border-[#dedbd4] bg-white text-[#151515] shadow-[0_8px_22px_rgba(21,21,21,0.04)] hover:border-[#f24f09]/60 hover:text-[#f24f09] hover:shadow-[0_0_0_1px_rgba(242,79,9,0.12),0_0_18px_rgba(242,79,9,0.16)]'
                      }`}
                    >
                      {isSelected ? (
                        <span className="pointer-events-none absolute -right-6 -top-6 h-16 w-16 rounded-full bg-[#f24f09]/20 blur-xl" />
                      ) : null}
                      <span className="block font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">
                        Day {index + 1}
                      </span>
                      <span className="mt-3 block font-caption text-[9px] uppercase tracking-[0.13em]">
                        {label.weekday}
                      </span>
                      <span className="mt-1 block font-headline text-3xl leading-none">{label.day}</span>
                      <span
                        className={`absolute inset-x-3 bottom-3 h-1 rounded-full shadow-[0_0_14px_currentColor] ${
                          isSelected ? 'bg-[#f24f09] text-[#f24f09]' : 'bg-[#dedbd4] text-transparent'
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <aside className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
            <div className="flex items-center gap-2 text-[#817b72]">
              <Clock className="h-4 w-4 text-[#f24f09]" strokeWidth={1.7} />
              <p className="font-caption text-[10px] uppercase tracking-[0.16em]">Scheduling</p>
            </div>
            <p className="mt-3 font-headline text-2xl uppercase leading-none text-[#151515]">{selectedLabel}</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {displayTimes.map((time) => {
                const isSelected = selectedTime === time;
                const isBlocked = !isSlotSelectable(time);
                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setSelectedTime(time)}
                    disabled={isBlocked && !manageAvailability}
                    className={`min-h-11 rounded-full border px-3 font-caption text-[10px] uppercase tracking-[0.14em] transition-all duration-300 ${
                      isSelected
                        ? isBlocked
                          ? 'border-[#151515] bg-[#151515] text-white shadow-[0_0_0_1px_rgba(21,21,21,0.18),0_0_20px_rgba(21,21,21,0.18)]'
                          : 'border-[#f24f09] bg-[radial-gradient(circle_at_50%_0%,rgba(242,79,9,0.22),rgba(255,255,255,0)_64%),#fffaf6] text-[#f24f09] shadow-[0_0_0_1px_rgba(242,79,9,0.22),0_0_20px_rgba(242,79,9,0.28)]'
                        : isBlocked
                          ? 'border-[#dedbd4] bg-[#eeeae4] text-[#aaa39a] line-through opacity-60'
                        : 'border-[#dedbd4] bg-white text-[#6d675f] hover:border-[#f24f09]/60 hover:text-[#f24f09] hover:shadow-[0_0_18px_rgba(242,79,9,0.14)]'
                    }`}
                  >
                    {formatTime(time)}
                  </button>
                );
              })}
            </div>
            {manageAvailability ? (
              <button
                type="button"
                onClick={toggleSelectedBlock}
                className={`ios-pill mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full px-4 font-control text-xs font-semibold uppercase tracking-[0.08em] ${
                  selectedTimeBlocked
                    ? 'border border-[#151515] bg-white text-[#151515]'
                    : 'border border-[#151515] bg-[#151515] text-white'
                }`}
              >
                {selectedTimeBlocked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                {selectedTimeBlocked ? 'Unblock time' : 'Block this time'}
              </button>
            ) : null}
            <div className="mt-4 rounded-md border border-[#dedbd4] bg-white p-3">
              <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-[#817b72]">Selected block</p>
              <p className="mt-2 font-body text-sm font-semibold text-[#151515]">{title}</p>
              <p className="mt-1 font-body text-xs leading-relaxed text-[#66615a]">{description}</p>
            </div>
          </aside>
        </div>
        {manageAvailability ? (
          <BookingAvailabilityControls
            availability={availability}
            durationMinutes={selectedDuration}
            selectedDate={selectedDate}
            selectedTime={selectedTime}
            onChange={updateAvailability}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="bg-transparent p-0">
      <div className="flex items-start justify-between gap-4">
        <div>
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
            Schedule
          </p>
          <h2 className="mt-2 font-section text-3xl leading-none tracking-normal text-text">Choose a block</h2>
        </div>
        <label className="p-1 text-right">
          <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">
            Duration
          </p>
          <select
            value={selectedDuration}
            onChange={(event) => setSelectedDuration(Number(event.target.value))}
            className="mt-1 bg-transparent font-headline text-lg text-text outline-none"
          >
            {durationOptions.map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes}m
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-6">
        <div className="mb-4 flex items-center justify-between gap-3 py-2 text-text-muted sm:mb-3 sm:py-0">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-gold" strokeWidth={1.7} />
            <div>
              <p className="font-caption text-[10px] uppercase tracking-[0.16em]">Choose date</p>
              <p className="mt-1 font-body text-xs text-text-muted">
                <span className="font-semibold text-text">{cycle.label}</span>
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => goToCycle(cycleIndex - 1)}
              disabled={cycleIndex === 0}
              aria-label="Previous calendar cycle"
              className="ios-pill flex h-9 w-9 items-center justify-center rounded-full border border-border bg-bg/70 text-text disabled:cursor-not-allowed disabled:opacity-35"
            >
              <ChevronLeft className="h-4 w-4" strokeWidth={1.8} />
            </button>
            <button
              type="button"
              onClick={() => goToCycle(cycleIndex + 1)}
              aria-label="Next calendar cycle"
              className="ios-pill flex h-9 w-9 items-center justify-center rounded-full border border-gold/40 bg-bg/70 text-gold"
            >
              <ChevronRight className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-2">
          {days.map((date) => {
            const isSelected = date.toDateString() === selectedDate.toDateString();
            const isPast = !manageAvailability && isBeforeBookableStart(date);
            const label = formatDay(date);
            return (
              <button
                key={date.toISOString()}
                type="button"
                onClick={() => setSelectedDate(date)}
                disabled={isPast}
                className={`relative min-h-[74px] overflow-hidden rounded-md border px-2 py-3 text-left transition-all duration-300 ${
                  isSelected
                    ? 'border-gold bg-[radial-gradient(circle_at_50%_14%,rgba(242,79,9,0.34),rgba(242,79,9,0.10)_48%,rgba(255,255,255,0)_72%)] text-gold shadow-[0_0_0_1px_rgba(242,79,9,0.26),0_0_24px_rgba(242,79,9,0.34),inset_0_1px_0_rgba(255,255,255,0.14)]'
                    : isPast
                      ? 'border-border bg-bg/40 text-text-dim opacity-45'
                      : 'border-border bg-bg/70 text-text shadow-[0_8px_22px_rgba(0,0,0,0.04)] hover:border-gold/50 hover:shadow-[0_0_0_1px_rgba(242,79,9,0.12),0_0_18px_rgba(242,79,9,0.16)]'
                }`}
              >
                {isSelected ? (
                  <span className="pointer-events-none absolute -right-5 -top-5 h-14 w-14 rounded-full bg-gold/25 blur-xl" />
                ) : null}
                <span className="block font-caption text-[9px] uppercase tracking-[0.13em] opacity-70">
                  {label.weekday}
                </span>
                <span className="mt-1 block font-headline text-2xl leading-none">{label.day}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2 text-text-muted">
          <Clock className="h-4 w-4 text-gold" strokeWidth={1.7} />
          <p className="font-caption text-[10px] uppercase tracking-[0.16em]">Choose time</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {displayTimes.map((time) => {
            const isSelected = selectedTime === time;
            const isBlocked = !isSlotSelectable(time);
            return (
              <button
                key={time}
                type="button"
                onClick={() => setSelectedTime(time)}
                disabled={isBlocked}
                className={`min-h-11 rounded-full border px-3 font-caption text-[10px] uppercase tracking-[0.14em] transition-all duration-300 ${
                  isSelected
                    ? 'border-gold bg-[radial-gradient(circle_at_50%_0%,rgba(242,79,9,0.34),rgba(242,79,9,0.10)_58%,rgba(255,255,255,0)_82%)] text-gold shadow-[0_0_0_1px_rgba(242,79,9,0.24),0_0_20px_rgba(242,79,9,0.3)]'
                    : isBlocked
                      ? 'border-border bg-bg/40 text-text-dim line-through opacity-45'
                    : 'border-border bg-bg/70 text-text-muted hover:border-gold/50 hover:text-text hover:shadow-[0_0_18px_rgba(242,79,9,0.14)]'
                }`}
              >
                {formatTime(time)}
              </button>
            );
          })}
        </div>
      </div>

      {onBookSession && requiresConsent ? (
        <div className="mt-5 rounded-md border border-gold/25 bg-surface-2/70 p-4 shadow-glass">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-gold" strokeWidth={1.7} />
            <div className="min-w-0 flex-1">
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
                Consent form
              </p>
              <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
                Open the client consent form before confirming your session.
              </p>
              <a
                href={BOOKING_CONSENT_FORM_URL}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full border border-gold/40 px-4 font-control text-[11px] font-semibold uppercase tracking-[0.08em] text-gold transition hover:border-gold hover:text-text"
              >
                Open Consent Form <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
              </a>
              <label className="mt-4 flex items-start gap-3 rounded-md border border-border bg-bg/60 p-3">
                <input
                  type="checkbox"
                  checked={consentAcknowledged}
                  onChange={(event) => {
                    setConsentAcknowledged(event.target.checked);
                    if (event.target.checked && bookingError?.toLowerCase().includes('consent')) {
                      setBookingError(null);
                    }
                  }}
                  className="mt-1 h-4 w-4 rounded border-border accent-gold"
                />
                <span className="font-body text-sm leading-relaxed text-text-muted">
                  I understand the consent form is required before my first session.
                </span>
              </label>
            </div>
          </div>
        </div>
      ) : null}

      {onBookSession ? (
        <button
          type="button"
          onClick={bookSelectedSession}
          disabled={bookingPending || slotsLoading || (requiresConsent && !consentAcknowledged)}
          className="ios-pill mt-5 inline-flex min-h-14 w-full flex-col items-center justify-center rounded-full bg-gold px-4 text-bg transition-colors hover:bg-gold-deep disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="font-control text-sm font-semibold uppercase tracking-[0.08em]">
            {bookingButtonLabel}
          </span>
          <span className="mt-1 font-caption text-[8px] uppercase tracking-[0.12em] opacity-75">
            {bookingButtonSubtext}
          </span>
          {bookingError ? (
            <span className="mt-2 max-w-xs text-center font-body text-[11px] normal-case tracking-normal text-bg/80">
              {bookingError}
            </span>
          ) : null}
        </button>
      ) : (
        <a
          href={eventUrl}
          target="_blank"
          rel="noreferrer"
          className="ios-pill mt-5 inline-flex min-h-14 w-full flex-col items-center justify-center rounded-full bg-gold px-4 text-bg transition-colors hover:bg-gold-deep"
        >
          <span className="inline-flex items-center gap-2 font-control text-sm font-semibold uppercase tracking-[0.08em]">
            Book Session <ExternalLink className="h-4 w-4" strokeWidth={1.7} />
          </span>
          <span className="mt-1 font-caption text-[8px] uppercase tracking-[0.12em] opacity-75">
            Add to Google Calendar
          </span>
        </a>
      )}
    </section>
  );
}

function BookingAvailabilityControls({
  availability,
  durationMinutes,
  selectedDate,
  selectedTime,
  onChange,
}: {
  availability: BookingAvailability;
  durationMinutes: number;
  selectedDate: Date;
  selectedTime: string;
  onChange: (patch: Partial<BookingAvailability>) => void;
}) {
  const [startTimeDraft, setStartTimeDraft] = useState(availability.startTimes[0] ?? availability.firstStart);
  const selectedKey = formatCalendarDateKey(selectedDate);
  const blockedSlots = availability.blockedSlots[selectedKey] ?? [];
  const generatedTimes = buildAvailableTimes(availability, durationMinutes);
  const exactStarts = availability.startTimes ?? [];

  function addExactStart() {
    const next = normalizeStartTimes([...exactStarts, startTimeDraft]);
    if (next.length === exactStarts.length) return;
    onChange({ startTimes: next });
  }

  function removeExactStart(time: string) {
    onChange({ startTimes: exactStarts.filter((start) => start !== time) });
  }

  return (
    <section className="mt-4 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-[#f24f09]" strokeWidth={1.7} />
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">
              Booking rules
            </p>
          </div>
          <h3 className="mt-2 font-headline text-2xl uppercase leading-none text-[#151515]">
            Start times and buffers
          </h3>
          <p className="mt-2 max-w-2xl font-body text-xs leading-relaxed text-[#66615a]">
            These controls set the start-time range clients can book, add buffer time between sessions, and block off
            exact times for the selected calendar day.
          </p>
        </div>
        <div className="rounded-full border border-[#dedbd4] bg-white px-3 py-2 font-caption text-[9px] uppercase tracking-[0.12em] text-[#817b72]">
          {generatedTimes.length} starts · {exactStarts.length > 0 ? 'Exact' : 'Generated'}
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <label className="block rounded-md border border-[#dedbd4] bg-white p-3">
          <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">First start</span>
          <input
            type="time"
            value={availability.firstStart}
            onChange={(event) => onChange({ firstStart: event.target.value })}
            className="mt-2 min-h-11 w-full rounded-full border border-[#dedbd4] bg-[#fbfaf8] px-3 font-control text-sm font-semibold text-[#151515] outline-none focus:border-[#f24f09]"
          />
        </label>
        <label className="block rounded-md border border-[#dedbd4] bg-white p-3">
          <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Last start</span>
          <input
            type="time"
            value={availability.lastStart}
            onChange={(event) => onChange({ lastStart: event.target.value })}
            className="mt-2 min-h-11 w-full rounded-full border border-[#dedbd4] bg-[#fbfaf8] px-3 font-control text-sm font-semibold text-[#151515] outline-none focus:border-[#f24f09]"
          />
        </label>
        <label className="block rounded-md border border-[#dedbd4] bg-white p-3">
          <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">
            Buffer between
          </span>
          <select
            value={availability.bufferMinutes}
            onChange={(event) => onChange({ bufferMinutes: Number(event.target.value) })}
            className="mt-2 min-h-11 w-full rounded-full border border-[#dedbd4] bg-[#fbfaf8] px-3 font-control text-sm font-semibold text-[#151515] outline-none focus:border-[#f24f09]"
          >
            {[0, 15, 30, 45, 60].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes} min
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-4 rounded-md border border-[#dedbd4] bg-white p-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Exact starts</p>
            <p className="mt-1 font-body text-xs text-[#66615a]">
              Add trainer-approved starts like 6:30, 7:30, and 8:30.
            </p>
          </div>
          <div className="flex w-full gap-2 sm:w-auto">
            <input
              type="time"
              value={startTimeDraft}
              onChange={(event) => setStartTimeDraft(event.target.value)}
              className="min-h-11 min-w-0 flex-1 rounded-full border border-[#dedbd4] bg-[#fbfaf8] px-3 font-control text-sm font-semibold text-[#151515] outline-none focus:border-[#f24f09] sm:w-36 sm:flex-none"
            />
            <button
              type="button"
              onClick={addExactStart}
              className="ios-pill inline-flex min-h-11 items-center justify-center rounded-full bg-[#151515] px-4 text-white"
              aria-label="Add exact start time"
            >
              <Plus className="h-4 w-4" strokeWidth={1.8} />
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {exactStarts.length === 0 ? (
            <p className="rounded-full border border-[#dedbd4] bg-[#fbfaf8] px-3 py-2 font-body text-xs text-[#66615a]">
              Generated range is active until an exact start is added.
            </p>
          ) : (
            exactStarts.map((time) => (
              <span
                key={time}
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-[#f24f09]/35 bg-[#fff3ec] pl-3 pr-1 font-control text-[11px] font-semibold uppercase tracking-[0.08em] text-[#151515]"
              >
                {formatTime(time)}
                <button
                  type="button"
                  onClick={() => removeExactStart(time)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-full text-[#817b72] transition hover:bg-white hover:text-[#151515]"
                  aria-label={`Remove ${formatTime(time)}`}
                >
                  <X className="h-3.5 w-3.5" strokeWidth={1.8} />
                </button>
              </span>
            ))
          )}
        </div>
      </div>

      <div className="mt-4 rounded-md border border-[#dedbd4] bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">
              Blocked on {formatFullDate(selectedDate)}
            </p>
            <p className="mt-1 font-body text-xs text-[#66615a]">
              Selected time: <span className="font-semibold text-[#151515]">{formatTime(selectedTime)}</span>
            </p>
          </div>
          <p className="font-caption text-[9px] uppercase tracking-[0.12em] text-[#f24f09]">
            {blockedSlots.length} blocked
          </p>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {generatedTimes.map((time) => {
            const blocked = blockedSlots.includes(time);
            return (
              <button
                key={time}
                type="button"
                onClick={() => {
                  const next = toggleBlockedSlot(availability, selectedDate, time);
                  onChange({ blockedSlots: next.blockedSlots });
                }}
                className={`ios-pill inline-flex min-h-9 items-center gap-2 rounded-full px-3 font-control text-[11px] font-semibold uppercase tracking-[0.08em] ${
                  blocked
                    ? 'border border-[#151515] bg-[#151515] text-white'
                    : 'border border-[#dedbd4] bg-[#fbfaf8] text-[#66615a]'
                }`}
              >
                {blocked ? <Lock className="h-3.5 w-3.5" /> : <Unlock className="h-3.5 w-3.5" />}
                {formatTime(time)}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}
