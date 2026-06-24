import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { BillingRetryUnavailableError, retryLatestInvoice } from '@/lib/billing';

export const runtime = 'nodejs';

export async function POST() {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  try {
    return NextResponse.json({ ok: true, billing: await retryLatestInvoice(appUser) });
  } catch (error) {
    if (error instanceof BillingRetryUnavailableError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to retry payment' },
      { status: 500 }
    );
  }
}
