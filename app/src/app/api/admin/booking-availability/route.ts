import { NextResponse } from 'next/server';
import { parseBookingAvailability, type BookingAvailability } from '@/lib/bookingAvailability';
import { getBookingAvailability, saveBookingAvailability } from '@/lib/bookingAvailabilityStore';
import { requireApiAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

export async function GET() {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  try {
    const availability = await getBookingAvailability();
    return NextResponse.json({ availability });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unable to load booking availability' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as { availability?: unknown } | null;
  if (!body?.availability) {
    return NextResponse.json({ error: 'availability is required' }, { status: 400 });
  }

  const parsed: BookingAvailability = parseBookingAvailability(body.availability);

  try {
    const availability = await saveBookingAvailability(parsed);
    return NextResponse.json({ ok: true, availability });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'unable to save booking availability' },
      { status: 500 }
    );
  }
}
