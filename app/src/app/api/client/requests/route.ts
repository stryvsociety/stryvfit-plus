import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import {
  ClientRequestValidationError,
  createStoredClientRequest,
  listClientRequests,
  type CreateStoredClientRequestInput,
} from '@/lib/clientRequestStore';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 30);

  try {
    const requests = await listClientRequests(appUser, limit);
    return NextResponse.json({ requests });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load client requests' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const body = (await req.json().catch(() => null)) as CreateStoredClientRequestInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'client request details are required' }, { status: 400 });
  }

  try {
    const request = await createStoredClientRequest(body, appUser);
    return NextResponse.json({ ok: true, request }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to send client request';
    const status = error instanceof ClientRequestValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
