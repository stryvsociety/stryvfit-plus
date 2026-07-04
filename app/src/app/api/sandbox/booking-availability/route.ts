import { NextResponse } from 'next/server';
import { buildAvailableTimesForDate } from '@/lib/bookingAvailability';

export const runtime = 'nodejs';

const allowedDurations = new Set([30, 45, 60, 90, 120]);

export async function GET(req: Request) {
  const url = new URL(req.url);
  const date = url.searchParams.get('date');
  const duration = Number(url.searchParams.get('durationMinutes') ?? 60);

  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !allowedDurations.has(duration)) {
    return NextResponse.json({ error: 'invalid availability query' }, { status: 400 });
  }

  const availability = {
    firstStart: '09:00',
    lastStart: '16:00',
    bufferMinutes: 30,
    startTimes: [],
    weeklyStartTimes: {
      '0': ['10:00', '11:30', '13:00'],
      '1': ['09:00', '10:30', '12:00', '13:30', '15:00'],
      '2': ['09:00', '10:30', '12:00', '13:30', '15:00'],
      '3': ['09:00', '10:30', '12:00', '13:30', '15:00'],
      '4': ['09:00', '10:30', '12:00', '13:30', '15:00'],
      '5': ['09:00', '10:30', '12:00', '13:30'],
      '6': ['10:00', '11:30', '13:00'],
    },
    blockedSlots: {},
  };

  const times = buildAvailableTimesForDate(availability, duration, date).map((time, index) => ({
    time,
    available: index % 5 !== 3,
    reason: index % 5 === 3 ? 'Preview hold' : null,
  }));

  return NextResponse.json({ availability, times });
}
