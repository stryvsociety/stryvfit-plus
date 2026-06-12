import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import {
  ClientNoteValidationError,
  createClientNote,
  listAdminClientNotes,
  type CreateClientNoteInput,
} from '@/lib/clientNotes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 50);
  const status = url.searchParams.get('status');

  try {
    const notes = await listAdminClientNotes({ limit, status });
    return NextResponse.json({ notes });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load client notes';
    const responseStatus = error instanceof ClientNoteValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status: responseStatus });
  }
}

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = (await req.json().catch(() => null)) as CreateClientNoteInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'client note details are required' }, { status: 400 });
  }

  try {
    const result = await createClientNote(body, admin);
    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to save client note';
    const status = error instanceof ClientNoteValidationError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
