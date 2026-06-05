import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { cancelBooking, updateBooking, type UpdateBookingInput } from '@/lib/bookings';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'booking id is required' }, { status: 400 });
  }

  try {
    const result = await cancelBooking(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cancel booking';
    const status = message === 'Booking not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'booking id is required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as UpdateBookingInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'appointment details are required' }, { status: 400 });
  }

  try {
    const result = await updateBooking(id, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update booking';
    const status = message === 'Booking not found' ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
