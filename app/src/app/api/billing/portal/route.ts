import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { BillingPortalUnavailableError, createBillingPortalUrl } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const body = (await req.json().catch(() => null)) as { returnPath?: unknown } | null;

  try {
    const url = await createBillingPortalUrl(appUser, body?.returnPath);
    return NextResponse.json({ ok: true, url });
  } catch (error) {
    if (error instanceof BillingPortalUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to open billing portal' },
      { status: 500 }
    );
  }
}
