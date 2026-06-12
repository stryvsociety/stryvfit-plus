import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { createAdminClient, deleteAdminClient, listAdminClients, type CreateAdminClientInput } from '@/lib/bookings';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const limit = url.searchParams.get('limit') ?? undefined;

  try {
    const clients = await listAdminClients(limit);
    return NextResponse.json({ clients });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load clients' },
      { status: 500 }
    );
  }
}

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

export async function DELETE(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as { id?: unknown } | null;
  const id = typeof body?.id === 'string' ? body.id : '';
  if (!id) {
    return NextResponse.json({ error: 'client id is required' }, { status: 400 });
  }

  try {
    const result = await deleteAdminClient(id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to remove client';
    const status = message === 'Client not found' ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
