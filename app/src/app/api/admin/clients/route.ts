import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { createAdminClient, type CreateAdminClientInput } from '@/lib/bookings';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as CreateAdminClientInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'client details are required' }, { status: 400 });
  }

  try {
    const result = await createAdminClient(body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to add client' },
      { status: 400 }
    );
  }
}
