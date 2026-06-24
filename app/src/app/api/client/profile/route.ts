import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import { updateClientProfile, type UpdateClientProfileInput } from '@/lib/bookings';

export const runtime = 'nodejs';

function profilePayload(appUser: {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  profile_goal: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
}) {
  return {
    id: appUser.id,
    email: appUser.email,
    fullName: appUser.full_name,
    phone: appUser.phone,
    profileGoal: appUser.profile_goal,
    emergencyContactName: appUser.emergency_contact_name,
    emergencyContactPhone: appUser.emergency_contact_phone,
  };
}

export async function GET() {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  return NextResponse.json({ ok: true, profile: profilePayload(appUser) });
}

export async function PATCH(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const body = (await req.json().catch(() => null)) as UpdateClientProfileInput | null;
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'profile details are required' }, { status: 400 });
  }

  try {
    const updated = await updateClientProfile(appUser, body);
    return NextResponse.json({ ok: true, profile: profilePayload(updated) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to update profile' },
      { status: 400 }
    );
  }
}
