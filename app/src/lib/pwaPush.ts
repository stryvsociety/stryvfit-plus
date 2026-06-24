import webPush from 'web-push';
import type { AppUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';

type PushSubscriptionInput = {
  endpoint?: unknown;
  keys?: {
    p256dh?: unknown;
    auth?: unknown;
  };
};

type BillingPushPayload = {
  title: string;
  body: string;
  url?: string;
  retryUrl?: string;
};

type PushSubscriptionRow = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export function webPushPublicKey(): string | null {
  return process.env.WEB_PUSH_PUBLIC_KEY ?? null;
}

function webPushReady(): boolean {
  return Boolean(process.env.WEB_PUSH_PUBLIC_KEY && process.env.WEB_PUSH_PRIVATE_KEY);
}

function configureWebPush(): boolean {
  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY;
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webPush.setVapidDetails(
    process.env.WEB_PUSH_SUBJECT ?? 'mailto:ashley@stryvsocietyfit.com',
    publicKey,
    privateKey
  );
  return true;
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export async function saveBillingPushSubscription(
  appUser: AppUser,
  input: PushSubscriptionInput,
  userAgent: string | null
): Promise<void> {
  const endpoint = stringValue(input.endpoint);
  const p256dh = stringValue(input.keys?.p256dh);
  const auth = stringValue(input.keys?.auth);
  if (!endpoint || !p256dh || !auth) {
    throw new Error('Push subscription is missing required browser keys.');
  }

  const { error } = await serviceClient().from('billing_push_subscriptions').upsert(
    {
      app_user_id: appUser.id,
      endpoint,
      p256dh,
      auth,
      user_agent: userAgent,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: 'endpoint' }
  );

  if (error) throw error;
}

export async function deleteBillingPushSubscription(appUser: AppUser, endpoint: unknown): Promise<void> {
  const normalizedEndpoint = stringValue(endpoint);
  if (!normalizedEndpoint) return;

  const { error } = await serviceClient()
    .from('billing_push_subscriptions')
    .delete()
    .eq('app_user_id', appUser.id)
    .eq('endpoint', normalizedEndpoint);

  if (error) throw error;
}

export async function sendBillingPushNotice(
  appUserId: string,
  payload: BillingPushPayload
): Promise<{ sent: number; removed: number; skipped: boolean }> {
  if (!webPushReady() || !configureWebPush()) return { sent: 0, removed: 0, skipped: true };

  const { data, error } = await serviceClient()
    .from('billing_push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('app_user_id', appUserId);

  if (error) throw error;

  let sent = 0;
  let removed = 0;
  for (const row of ((data ?? []) as PushSubscriptionRow[])) {
    try {
      await webPush.sendNotification(
        {
          endpoint: row.endpoint,
          keys: { p256dh: row.p256dh, auth: row.auth },
        },
        JSON.stringify(payload)
      );
      sent++;
    } catch (error) {
      const statusCode = (error as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        removed++;
        await serviceClient().from('billing_push_subscriptions').delete().eq('id', row.id);
      } else {
        throw error;
      }
    }
  }

  return { sent, removed, skipped: false };
}
