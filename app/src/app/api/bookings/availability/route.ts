import { NextResponse } from 'next/server';
import { buildAvailableTimes } from '@/lib/bookingAvailability';
import { combineBookingTzDateAndTime, getBookingAvailability } from '@/lib/bookingAvailabilityStore';
import { assertSlotAvailable, expireStaleHolds } from '@/lib/bookings';
import { requireApiUser } from '@/lib/auth';

export const runtime = 'nodejs';

const ALLOWED_DURATIONS = [30, 45, 60, 90, 120] as const;

export async function GET(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const duration = Number(url.searchParams.get('durationMinutes') ?? 60);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !ALLOWED_DURATIONS.includes(duration as (typeof ALLOWED_DURATIONS)[number])) {
    return NextResponse.json({ error: 'invalid availability query' }, { status: 400 });
  }

  await expireStaleHolds();
  const availability = await getBookingAvailability();
  const times = await Promise.all(
    buildAvailableTimes(availability, duration).map(async (time) => {
      const start = combineBookingTzDateAndTime(date, time);
      const end = new Date(start.getTime() + duration * 60 * 1000);
      const slotCheck = await assertSlotAvailable(start.toISOString(), end.toISOString(), {
        skipHoldExpiry: true,
      });
      return { time, available: slotCheck.ok, reason: slotCheck.ok ? null : slotCheck.reason };
    })
  );

  return NextResponse.json({ availability, times });
}
