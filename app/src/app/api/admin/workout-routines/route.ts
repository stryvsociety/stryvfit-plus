import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import {
  AdminWorkoutRoutineValidationError,
  createAdminWorkoutRoutine,
  listAdminWorkoutRoutines,
  type CreateAdminWorkoutRoutineInput,
} from '@/lib/adminWorkoutRoutines';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 30);

  try {
    const routines = await listAdminWorkoutRoutines(limit);
    return NextResponse.json({ routines });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load workout routines' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as CreateAdminWorkoutRoutineInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'workout routine details are required' }, { status: 400 });
  }

  try {
    const result = await createAdminWorkoutRoutine(body, admin);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save workout routine';
    const status = error instanceof AdminWorkoutRoutineValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
