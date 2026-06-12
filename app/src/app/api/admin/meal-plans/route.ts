import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import {
  AdminMealPlanValidationError,
  createAdminMealPlan,
  listAdminMealPlans,
  type CreateAdminMealPlanInput,
} from '@/lib/adminMealPlans';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const status = url.searchParams.get('status');

  try {
    const mealPlans = await listAdminMealPlans({ limit, status });
    return NextResponse.json({ mealPlans });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load meal plans';
    const responseStatus = error instanceof AdminMealPlanValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status: responseStatus });
  }
}

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as CreateAdminMealPlanInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'meal plan details are required' }, { status: 400 });
  }

  try {
    const result = await createAdminMealPlan(body, admin);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save meal plan';
    const status = error instanceof AdminMealPlanValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
