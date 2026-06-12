import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import {
  AdminAppointmentPlanValidationError,
  createAdminAppointmentPlan,
  listAdminAppointmentPlans,
  type CreateAdminAppointmentPlanInput,
} from '@/lib/adminAppointmentPlans';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const status = url.searchParams.get('status');

  try {
    const appointmentPlans = await listAdminAppointmentPlans({ limit, status });
    return NextResponse.json({ appointmentPlans });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load appointment plans';
    const responseStatus = error instanceof AdminAppointmentPlanValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status: responseStatus });
  }
}

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as CreateAdminAppointmentPlanInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'appointment plan details are required' }, { status: 400 });
  }

  try {
    const result = await createAdminAppointmentPlan(body, admin);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save appointment plan';
    const status = error instanceof AdminAppointmentPlanValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
