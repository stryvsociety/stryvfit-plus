import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function retiredMealPrepResponse() {
  return NextResponse.json({ error: 'Not found' }, { status: 404 });
}

export async function GET() { return retiredMealPrepResponse(); }
export async function POST() { return retiredMealPrepResponse(); }
