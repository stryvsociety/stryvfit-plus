import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { cancelClientBooking } from '@/lib/bookings';

export const runtime = 'nodejs';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'booking id is required' }, { status: 400 });
  }

  try {
    const result = await cancelClientBooking(appUser, id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to cancel booking';
    const status = message === 'Booking not found' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
