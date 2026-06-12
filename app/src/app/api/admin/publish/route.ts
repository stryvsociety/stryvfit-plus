import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import {
  AdminPublishValidationError,
  createAdminPublishRecord,
  listAdminPublishRecords,
  type CreateAdminPublishInput,
} from '@/lib/adminPublish';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 30);

  try {
    const records = await listAdminPublishRecords(limit);
    return NextResponse.json({ records });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load client posts' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as CreateAdminPublishInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'post details are required' }, { status: 400 });
  }

  try {
    const record = await createAdminPublishRecord(body, admin);
    return NextResponse.json({ ok: true, record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to post to client';
    const status = error instanceof AdminPublishValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
