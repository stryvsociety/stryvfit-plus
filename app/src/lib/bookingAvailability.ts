export type BookingAvailability = {
  firstStart: string;
  lastStart: string;
  bufferMinutes: number;
  startTimes: string[];
  blockedSlots: Record<string, string[]>;
};

export const BOOKING_AVAILABILITY_STORAGE_KEY = 'stryvfit-booking-availability';

export const DEFAULT_BOOKING_AVAILABILITY: BookingAvailability = {
  firstStart: '07:00',
  lastStart: '18:00',
  bufferMinutes: 30,
  startTimes: [],
  blockedSlots: {},
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseBookingAvailability(value: unknown): BookingAvailability {
  if (!isRecord(value)) return DEFAULT_BOOKING_AVAILABILITY;

  const blockedRaw = value.blockedSlots;
  const blockedSlots: Record<string, string[]> = {};
  if (isRecord(blockedRaw)) {
    for (const [key, slots] of Object.entries(blockedRaw)) {
      if (Array.isArray(slots)) {
        blockedSlots[key] = slots.filter((slot): slot is string => typeof slot === 'string');
      }
    }
  }

  const startTimes = Array.isArray(value.startTimes)
    ? normalizeStartTimes(value.startTimes.filter((time): time is string => typeof time === 'string'))
    : DEFAULT_BOOKING_AVAILABILITY.startTimes;

  return {
    firstStart:
      typeof value.firstStart === 'string' ? value.firstStart : DEFAULT_BOOKING_AVAILABILITY.firstStart,
    lastStart: typeof value.lastStart === 'string' ? value.lastStart : DEFAULT_BOOKING_AVAILABILITY.lastStart,
    bufferMinutes:
      typeof value.bufferMinutes === 'number' && Number.isFinite(value.bufferMinutes)
        ? value.bufferMinutes
        : DEFAULT_BOOKING_AVAILABILITY.bufferMinutes,
    startTimes,
    blockedSlots,
  };
}

/** Calendar day the user selected in the scheduler UI (local date, not UTC). */
export function formatCalendarDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/** @deprecated Prefer formatCalendarDateKey for scheduler dates. */
export function dateKey(date: Date): string {
  return formatCalendarDateKey(date);
}

export function bookingTimezone(): string {
  return process.env.BOOKING_TIMEZONE ?? 'America/New_York';
}

export function combineBookingTzDateAndTime(dateKey: string, time: string): Date {
  const tz = bookingTimezone();
  const [year, month, day] = dateKey.split('-').map(Number);
  const [hours, minutes] = time.split(':').map(Number);
  const utcGuess = new Date(Date.UTC(year, month - 1, day, hours, minutes, 0));
  const asInTz = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(utcGuess);
  const gotHour = Number(asInTz.find((p) => p.type === 'hour')?.value ?? hours);
  const gotMinute = Number(asInTz.find((p) => p.type === 'minute')?.value ?? minutes);
  const deltaMinutes = hours * 60 + minutes - (gotHour * 60 + gotMinute);
  return new Date(utcGuess.getTime() + deltaMinutes * 60 * 1000);
}

export function readBookingAvailability(): BookingAvailability {
  if (typeof window === 'undefined') return DEFAULT_BOOKING_AVAILABILITY;

  try {
    const stored = window.localStorage.getItem(BOOKING_AVAILABILITY_STORAGE_KEY);
    if (!stored) return DEFAULT_BOOKING_AVAILABILITY;
    return parseBookingAvailability(JSON.parse(stored));
  } catch {
    return DEFAULT_BOOKING_AVAILABILITY;
  }
}

export function saveBookingAvailability(next: BookingAvailability): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(BOOKING_AVAILABILITY_STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('stryvfit-booking-availability'));
}

export function toggleBlockedSlot(
  availability: BookingAvailability,
  date: Date,
  time: string
): BookingAvailability {
  const key = dateKey(date);
  const current = availability.blockedSlots[key] ?? [];
  const exists = current.includes(time);
  const nextSlots = exists ? current.filter((slot) => slot !== time) : [...current, time].sort();
  return {
    ...availability,
    blockedSlots: {
      ...availability.blockedSlots,
      [key]: nextSlots,
    },
  };
}

export function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

export function isValidBookingTime(time: string): boolean {
  if (!/^\d{2}:\d{2}$/.test(time)) return false;
  const [hours, minutes] = time.split(':').map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

export function normalizeStartTimes(times: string[]): string[] {
  return [...new Set(times.filter(isValidBookingTime))].sort(
    (a, b) => timeToMinutes(a) - timeToMinutes(b)
  );
}

export function buildAvailableTimes(availability: BookingAvailability, durationMinutes: number): string[] {
  const customStartTimes = normalizeStartTimes(availability.startTimes ?? []);
  if (customStartTimes.length > 0) return customStartTimes;

  const first = timeToMinutes(availability.firstStart);
  const last = timeToMinutes(availability.lastStart);
  const step = Math.max(15, durationMinutes + availability.bufferMinutes);
  const slots: string[] = [];

  for (let value = first; value <= last; value += step) {
    slots.push(minutesToTime(value));
  }

  return slots.length > 0 ? slots : [availability.firstStart];
}
