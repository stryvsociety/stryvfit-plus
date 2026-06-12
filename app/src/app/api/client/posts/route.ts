import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { listClientPublishRecords } from '@/lib/adminPublish';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const url = new URL(req.url);
  const limit = Number(url.searchParams.get('limit') ?? 30);

  try {
    const posts = await listClientPublishRecords(appUser, limit);
    return NextResponse.json({ posts });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load trainer posts' },
      { status: 500 }
    );
  }
}
