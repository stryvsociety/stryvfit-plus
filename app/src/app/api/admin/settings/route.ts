import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { isValidE164 } from '@/lib/imessage';
import { requireApiAdmin } from '@/lib/auth';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }
  const payload = body as Record<string, unknown>;
  const trainer_phone =
    typeof payload.trainer_phone === 'string' && payload.trainer_phone.length > 0
      ? payload.trainer_phone.trim()
      : null;
  const trainer_name =
    typeof payload.trainer_name === 'string' && payload.trainer_name.trim().length > 0
      ? payload.trainer_name.trim()
      : 'Ashley';

  if (trainer_phone && !isValidE164(trainer_phone)) {
    return NextResponse.json({ error: 'phone must be E.164' }, { status: 400 });
  }

  const sb = serviceClient();
  const { error } = await sb
    .from('app_settings')
    .upsert({ id: 1, trainer_phone, trainer_name, updated_at: new Date().toISOString() });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
