import { NextResponse } from 'next/server';
import { getLiveWebsitePrices } from '@/lib/stripePricing';

export const runtime = 'nodejs';

export async function GET() {
  try {
    return NextResponse.json(
      { prices: await getLiveWebsitePrices() },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch {
    return NextResponse.json({ error: 'Pricing is temporarily unavailable.' }, { status: 503 });
  }
}
