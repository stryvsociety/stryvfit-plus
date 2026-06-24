import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { updateAdminClient, type CreateAdminClientInput, type UpdateClientProfileInput } from '@/lib/bookings';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: 'client id is required' }, { status: 400 });
  }

  const body = (await req.json().catch(() => null)) as
    | (CreateAdminClientInput & UpdateClientProfileInput)
    | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'client details are required' }, { status: 400 });
  }

  try {
    const result = await updateAdminClient(id, body);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update client';
    const status = message === 'Client not found' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
