import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { getBillingSummary } from '@/lib/billing';

export const runtime = 'nodejs';

export async function GET() {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  try {
    return NextResponse.json({ ok: true, billing: await getBillingSummary(appUser) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load billing' },
      { status: 500 }
    );
  }
}
