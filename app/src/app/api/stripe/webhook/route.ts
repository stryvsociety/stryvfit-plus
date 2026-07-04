import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { confirmBookingFromStripe, ensureGoogleEvent, expireBookingForStripeSession } from '@/lib/bookings';
import { syncStripeSubscriptionBilling } from '@/lib/billing';
import { sendBookingCompletionNotice } from '@/lib/bookingNotifications';
import { billingNoticeReasonForSubscription, sendBillingRecoveryNotice } from '@/lib/billingNotifications';
import { serviceClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripeClient';

export const runtime = 'nodejs';

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = (invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }).subscription;
  if (!subscription) return null;
  return typeof subscription === 'string' ? subscription : subscription.id;
}

async function recordStripeEvent(event: Stripe.Event): Promise<boolean> {
  const sb = serviceClient();
  const { error } = await sb.from('stripe_webhook_events').insert({
    id: event.id,
    type: event.type,
    payload: event as unknown as Record<string, unknown>,
  });

  if (!error) return true;
  if (error.code === '23505') return false;
  throw error;
}

export async function POST(req: Request) {
  const signature = req.headers.get('stripe-signature');
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: 'stripe webhook is not configured' }, { status: 400 });
  }

  const rawBody = await req.text();
  let event: Stripe.Event;

  try {
    event = await stripe().webhooks.constructEventAsync(rawBody, signature, webhookSecret);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'invalid stripe signature' },
      { status: 400 }
    );
  }

  const shouldProcess = await recordStripeEvent(event);
  if (!shouldProcess) return NextResponse.json({ ok: true, duplicate: true });

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object as Stripe.Checkout.Session;
    const booking = await confirmBookingFromStripe(session);
    if (booking) {
      const googleEventId = await ensureGoogleEvent(booking).catch(() => null);
      await sendBookingCompletionNotice(booking, {
        calendarStatus: googleEventId ? 'created' : 'pending',
      }).catch(() => null);
    }
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    await expireBookingForStripeSession(session.id);
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    await syncStripeSubscriptionBilling(subscription);
    const reason = event.type === 'customer.subscription.deleted'
      ? 'subscription_canceled'
      : billingNoticeReasonForSubscription(subscription.status);
    if (reason) {
      await sendBillingRecoveryNotice({
        eventId: event.id,
        reason,
        customerId: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer.id,
        subscriptionId: subscription.id,
      }).catch(() => null);
    }
  }

  if (event.type === 'invoice.payment_failed' || event.type === 'invoice.payment_action_required') {
    const invoice = event.data.object as Stripe.Invoice;
    await sendBillingRecoveryNotice({
      eventId: event.id,
      reason: event.type === 'invoice.payment_action_required' ? 'payment_action_required' : 'payment_failed',
      customerId: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id ?? null,
      subscriptionId: invoiceSubscriptionId(invoice),
      invoice,
    }).catch(() => null);
  }

  if (event.type === 'invoice.paid') {
    const invoice = event.data.object as Stripe.Invoice;
    const subscriptionId = invoiceSubscriptionId(invoice);
    if (subscriptionId) {
      const latest = await stripe().subscriptions.retrieve(subscriptionId);
      await syncStripeSubscriptionBilling(latest);
    }
  }

  return NextResponse.json({ ok: true });
}
