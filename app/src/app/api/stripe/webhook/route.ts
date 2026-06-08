import { NextResponse } from 'next/server';
import Stripe from 'stripe';
import { confirmBookingFromStripe, ensureGoogleEvent, expireBookingForStripeSession } from '@/lib/bookings';
import { syncStripeSubscriptionBilling } from '@/lib/billing';
import { serviceClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripeClient';

export const runtime = 'nodejs';

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
    if (booking) await ensureGoogleEvent(booking).catch(() => null);
  }

  if (event.type === 'checkout.session.expired') {
    const session = event.data.object as Stripe.Checkout.Session;
    await expireBookingForStripeSession(session.id);
  }

  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object as Stripe.Subscription;
    await syncStripeSubscriptionBilling(subscription);
  }

  return NextResponse.json({ ok: true });
}
