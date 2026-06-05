import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { cancelBooking } from '@/lib/bookings';

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
