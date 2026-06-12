import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import {
  ClientRequestValidationError,
  listAdminClientRequests,
  updateClientRequestStatus,
} from '@/lib/clientRequestStore';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const status = url.searchParams.get('status');

  try {
    const requests = await listAdminClientRequests({ limit, status });
    return NextResponse.json({ requests });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load client requests';
    const responseStatus = error instanceof ClientRequestValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status: responseStatus });
  }
}

export async function PATCH(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as { id?: unknown; status?: unknown } | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'client request status details are required' }, { status: 400 });
  }

  try {
    const request = await updateClientRequestStatus(body.id, body.status, admin);
    return NextResponse.json({ ok: true, request });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update client request';
    const status = error instanceof ClientRequestValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
