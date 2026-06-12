import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { listClientNotes } from '@/lib/clientNotes';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 30);

  try {
    const notes = await listClientNotes(appUser, limit);
    return NextResponse.json({ notes });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load trainer notes' },
      { status: 500 }
    );
  }
}
