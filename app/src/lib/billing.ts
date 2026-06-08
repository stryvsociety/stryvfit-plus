import Stripe from 'stripe';
import type { AppUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';
import { appUrl, stripe } from '@/lib/stripeClient';

export class BillingPortalUnavailableError extends Error {}

function stripeCustomerId(value: Stripe.Checkout.Session['customer'] | Stripe.Subscription['customer'] | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return 'deleted' in value && value.deleted ? null : value.id;
}

function stripeSubscriptionId(value: Stripe.Checkout.Session['subscription'] | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function safeReturnPath(path: unknown): string {
  if (typeof path !== 'string') return '/book';
  if (!path.startsWith('/') || path.startsWith('//')) return '/book';
  return path;
}

export async function syncStripeSessionBilling(session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = session.metadata?.booking_id;
  const customerId = stripeCustomerId(session.customer);
  const subscriptionId = stripeSubscriptionId(session.subscription);
  if (!bookingId || (!customerId && !subscriptionId)) return;

  const sb = serviceClient();
  const booking = await sb
    .from('bookings')
    .select('app_user_id, client_email')
    .eq('id', bookingId)
    .maybeSingle();

  if (booking.error) throw booking.error;
  if (!booking.data) return;

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (customerId) updates.stripe_customer_id = customerId;
  if (subscriptionId) {
    updates.stripe_subscription_id = subscriptionId;
    updates.subscription_status = 'active';
  }

  const profileId = booking.data.app_user_id as string | null;
  const email = booking.data.client_email as string | null;
  const updated = profileId
    ? await sb.from('app_users').update(updates).eq('id', profileId)
    : email
      ? await sb.from('app_users').update(updates).eq('email', email.toLowerCase())
      : null;

  if (updated?.error) throw updated.error;
}

export async function syncStripeSubscriptionBilling(subscription: Stripe.Subscription): Promise<void> {
  const customerId = stripeCustomerId(subscription.customer);
  if (!customerId) return;

  const { error } = await serviceClient()
    .from('app_users')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      updated_at: new Date().toISOString(),
    })
    .or(`stripe_customer_id.eq.${customerId},stripe_subscription_id.eq.${subscription.id}`);

  if (error) throw error;
}

async function storedCustomerIdForUser(appUser: AppUser): Promise<string | null> {
  if (appUser.stripe_customer_id) return appUser.stripe_customer_id;

  const sb = serviceClient();
  const byUser = await sb
    .from('bookings')
    .select('stripe_customer_id')
    .eq('app_user_id', appUser.id)
    .not('stripe_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byUser.error) throw byUser.error;
  if (byUser.data?.stripe_customer_id) return byUser.data.stripe_customer_id as string;

  const byEmail = await sb
    .from('bookings')
    .select('stripe_customer_id')
    .eq('client_email', appUser.email)
    .not('stripe_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byEmail.error) throw byEmail.error;
  return (byEmail.data?.stripe_customer_id as string | undefined) ?? null;
}

export async function createBillingPortalUrl(appUser: AppUser, returnPath: unknown): Promise<string> {
  const customerId = await storedCustomerIdForUser(appUser);
  if (!customerId) {
    throw new BillingPortalUnavailableError('Book a paid package first, then billing changes will open here.');
  }

  const stripeClient = stripe();
  const configurations = await stripeClient.billingPortal.configurations.list({ limit: 1, active: true });
  if (configurations.data.length === 0) {
    throw new BillingPortalUnavailableError('Billing controls are being set up. Contact StryvFit+ to update billing for now.');
  }

  const session = await stripeClient.billingPortal.sessions.create({
    customer: customerId,
    return_url: appUrl(safeReturnPath(returnPath)),
  });

  return session.url;
}
