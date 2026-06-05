import { createClerkClient, verifyToken } from '@clerk/nextjs/server';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';
import { ADMIN_SIGN_IN_PATH, FIRST_SESSION_BOOKING_PATH } from '@/lib/routes';

export type AppRole = 'client' | 'trainer' | 'admin' | 'support';

export type AppUser = {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  stripe_customer_id: string | null;
};

function configuredAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? '')
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function roleFromMetadata(metadata: Record<string, unknown> | undefined): AppRole | null {
  const role = metadata?.role;
  return role === 'admin' || role === 'trainer' || role === 'support' || role === 'client'
    ? role
    : null;
}

function clerkSecretKey(): string {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('Clerk server configuration is missing');
  return secretKey;
}

async function sessionTokenFromRequest(): Promise<string | null> {
  const headerStore = await headers();
  const authHeader = headerStore.get('authorization');
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }

  const cookieStore = await cookies();
  return cookieStore.get('__session')?.value ?? cookieStore.get('__clerk_db_jwt')?.value ?? null;
}

async function getCurrentClerkUser() {
  const token = await sessionTokenFromRequest();
  if (!token) return null;

  const secretKey = clerkSecretKey();
  try {
    const payload = await verifyToken(token, { secretKey });
    const userId = typeof payload.sub === 'string' ? payload.sub : null;
    if (!userId) return null;

    const clerk = createClerkClient({ secretKey });
    return await clerk.users.getUser(userId);
  } catch {
    return null;
  }
}

export async function getCurrentAppUser(): Promise<AppUser | null> {
  const user = await getCurrentClerkUser();
  if (!user) return null;

  const email = user.primaryEmailAddress?.emailAddress?.toLowerCase();
  if (!email) return null;

  const metadataRole =
    roleFromMetadata(user.privateMetadata as Record<string, unknown> | undefined) ??
    roleFromMetadata(user.publicMetadata as Record<string, unknown> | undefined);
  const role: AppRole = metadataRole ?? (configuredAdminEmails().includes(email) ? 'admin' : 'client');
  const fullName = user.fullName ?? user.firstName ?? email;

  const sb = serviceClient();
  const { data, error } = await sb
    .from('app_users')
    .upsert(
      {
        clerk_user_id: user.id,
        email,
        full_name: fullName,
        role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'clerk_user_id' }
    )
    .select('id, clerk_user_id, email, full_name, role, stripe_customer_id')
    .single();

  if (error) throw error;
  return data as AppUser;
}

export async function requireAppUser(): Promise<AppUser> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect('/sign-in');
  return appUser;
}

export async function hasBookedFreeFirstSession(appUser: AppUser): Promise<boolean> {
  const { data, error } = await serviceClient()
    .from('bookings')
    .select('id')
    .eq('app_user_id', appUser.id)
    .eq('service_type', 'free')
    .in('status', ['held', 'pending_payment', 'confirmed', 'rescheduled', 'completed'])
    .limit(1);

  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function requireFirstSessionBooked(): Promise<AppUser> {
  const appUser = await requireAppUser();

  if (appUser.role === 'client' && !(await hasBookedFreeFirstSession(appUser))) {
    redirect(FIRST_SESSION_BOOKING_PATH);
  }

  return appUser;
}

export async function requireAdminUser(): Promise<AppUser> {
  const appUser = await getCurrentAppUser();
  if (!appUser) redirect(ADMIN_SIGN_IN_PATH);
  const allowlist = configuredAdminEmails();

  if (allowlist.length > 0) {
    if (!allowlist.includes(appUser.email.toLowerCase())) {
      redirect('/admin/access-denied');
    }
    return appUser;
  }

  if (appUser.role !== 'admin' && appUser.role !== 'trainer' && appUser.role !== 'support') {
    redirect('/book');
  }
  return appUser;
}

export async function requireApiUser(): Promise<AppUser | NextResponse> {
  try {
    const appUser = await getCurrentAppUser();
    return appUser ?? NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'profile unavailable' },
      { status: 500 }
    );
  }
}

export async function requireApiAdmin(): Promise<AppUser | NextResponse> {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const allowlist = configuredAdminEmails();
  if (allowlist.length > 0) {
    if (!allowlist.includes(appUser.email.toLowerCase())) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }
    return appUser;
  }

  if (appUser.role !== 'admin' && appUser.role !== 'trainer' && appUser.role !== 'support') {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  return appUser;
}
