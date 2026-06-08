import { NextResponse } from 'next/server';
import {
  assertSlotAvailable,
  attachStripeSession,
  createBookingHold,
  ensureGoogleEvent,
  normalizeBookingDate,
  priceIdForService,
} from '@/lib/bookings';
import { BOOKING_SERVICES, parseBookingService } from '@/lib/bookingServices';
import { BOOKING_CONSENT_FORM_URL, bookingRequiresConsent } from '@/lib/bookingConsent';
import { hasBookedFreeFirstSession, requireApiUser } from '@/lib/auth';
import { FIRST_SESSION_BOOKING_PATH } from '@/lib/routes';
import { appUrl, stripe } from '@/lib/stripeClient';

export const runtime = 'nodejs';

type CheckoutBody = {
  serviceType?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  durationMinutes?: unknown;
  clientPhone?: unknown;
  consentAcknowledged?: unknown;
};

export async function POST(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const body = (await req.json().catch(() => null)) as CheckoutBody | null;
  const startsAt = normalizeBookingDate(body?.startsAt);
  const endsAt = normalizeBookingDate(body?.endsAt);
  const durationMinutes = Number(body?.durationMinutes ?? 60);
  const serviceType = parseBookingService(body?.serviceType);
  const requiresConsent = bookingRequiresConsent(serviceType);

  if (appUser.role === 'client' && serviceType !== 'free' && !(await hasBookedFreeFirstSession(appUser))) {
    return NextResponse.json(
      {
        error: 'Book your free first session before selecting a package.',
        redirectUrl: appUrl(FIRST_SESSION_BOOKING_PATH),
      },
      { status: 409 }
    );
  }

  if (!startsAt || !endsAt || endsAt <= startsAt || ![30, 45, 60, 90, 120].includes(durationMinutes)) {
    return NextResponse.json({ error: 'invalid booking window' }, { status: 400 });
  }

  if (requiresConsent && body?.consentAcknowledged !== true) {
    return NextResponse.json(
      {
        error: 'Open and acknowledge the consent form before booking your session.',
        consentFormUrl: BOOKING_CONSENT_FORM_URL,
      },
      { status: 400 }
    );
  }

  const availability = await assertSlotAvailable(startsAt.toISOString(), endsAt.toISOString());
  if (!availability.ok) {
    return NextResponse.json({ error: availability.reason }, { status: 409 });
  }

  const booking = await createBookingHold({
    appUserId: appUser.id,
    clerkUserId: appUser.clerk_user_id,
    clientEmail: appUser.email,
    clientName: appUser.full_name,
    clientPhone: typeof body?.clientPhone === 'string' ? body.clientPhone : appUser.phone,
    serviceType,
    consentAcknowledged: requiresConsent ? true : undefined,
    consentFormUrl: requiresConsent ? BOOKING_CONSENT_FORM_URL : undefined,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    durationMinutes,
  });

  if (serviceType === 'free') {
    const googleEventId = await ensureGoogleEvent(booking);
    return NextResponse.json({
      ok: true,
      status: 'confirmed',
      bookingId: booking.id,
      calendarStatus: googleEventId ? 'created' : 'pending',
      redirectUrl: appUrl('/book?booking=confirmed'),
    });
  }

  const priceId = priceIdForService(serviceType);
  if (!priceId) {
    return NextResponse.json({ error: `Stripe price is not configured for ${serviceType}` }, { status: 500 });
  }
  const service = BOOKING_SERVICES[serviceType];

  const checkoutSession = await stripe().checkout.sessions.create({
    mode: service.paymentMode === 'subscription' ? 'subscription' : 'payment',
    ...(appUser.stripe_customer_id ? { customer: appUser.stripe_customer_id } : { customer_email: appUser.email }),
    client_reference_id: booking.id,
    line_items: [{ price: priceId, quantity: 1 }],
    expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
    metadata: {
      booking_id: booking.id,
      clerk_user_id: appUser.clerk_user_id,
      service_type: serviceType,
    },
    success_url: appUrl('/book?booking=success&session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: appUrl('/book?booking=cancelled'),
  });

  await attachStripeSession(booking.id, checkoutSession);

  return NextResponse.json({
    ok: true,
    status: 'pending_payment',
    bookingId: booking.id,
    checkoutUrl: checkoutSession.url,
  });
}
