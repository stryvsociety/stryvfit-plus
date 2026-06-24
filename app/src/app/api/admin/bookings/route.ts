import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { createAdminBooking, type CreateAdminBookingInput } from '@/lib/bookings';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as CreateAdminBookingInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'appointment details are required' }, { status: 400 });
  }

  try {
    const result = await createAdminBooking(body, admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to create appointment' },
      { status: 400 }
    );
  }
}
