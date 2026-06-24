import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import {
  deleteBillingPushSubscription,
  saveBillingPushSubscription,
  webPushPublicKey,
} from '@/lib/pwaPush';

export const runtime = 'nodejs';

export async function GET() {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const publicKey = webPushPublicKey();
  return NextResponse.json({ ok: true, enabled: Boolean(publicKey), publicKey });
}

export async function POST(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const body = await req.json().catch(() => null);
  const headerStore = await headers();

  try {
    await saveBillingPushSubscription(appUser, body ?? {}, headerStore.get('user-agent'));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to save push subscription' },
      { status: 400 }
    );
  }
}

export async function DELETE(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const body = (await req.json().catch(() => null)) as { endpoint?: unknown } | null;
  await deleteBillingPushSubscription(appUser, body?.endpoint);
  return NextResponse.json({ ok: true });
}
