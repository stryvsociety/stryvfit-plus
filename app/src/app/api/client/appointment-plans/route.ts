import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { listClientAppointmentPlans } from '@/lib/adminAppointmentPlans';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 30);

  try {
    const appointmentPlans = await listClientAppointmentPlans(appUser, limit);
    return NextResponse.json({ appointmentPlans });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load appointment plans' },
      { status: 500 }
    );
  }
}
