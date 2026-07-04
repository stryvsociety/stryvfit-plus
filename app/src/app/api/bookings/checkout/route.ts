import { NextResponse } from 'next/server';
import {
  assertSlotAvailable,
  attachStripeSession,
  createBookingHold,
  ensureGoogleEvent,
  normalizeBookingDate,
  normalizeClientPhoneInput,
  priceIdForService,
  type BookingCommunicationPreference,
} from '@/lib/bookings';
import { BOOKING_SERVICES, parseBookingService } from '@/lib/bookingServices';
import { BOOKING_CONSENT_FORM_URL, bookingRequiresConsent } from '@/lib/bookingConsent';
import { hasBookedFreeFirstSession, requireApiUser } from '@/lib/auth';
import { RETURNING_MEMBER_BOOKING_PATH } from '@/lib/routes';
import { sendBookingCompletionNotice } from '@/lib/bookingNotifications';
import { appUrl, stripe } from '@/lib/stripeClient';

export const runtime = 'nodejs';

type CheckoutBody = {
  serviceType?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  durationMinutes?: unknown;
  clientName?: unknown;
  clientPhone?: unknown;
  communicationPreference?: unknown;
  consentAcknowledged?: unknown;
};

function normalizeCommunicationPreference(value: unknown): BookingCommunicationPreference {
  return value === 'text' ? 'text' : 'email';
}

export async function POST(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const body = (await req.json().catch(() => null)) as CheckoutBody | null;
  const startsAt = normalizeBookingDate(body?.startsAt);
  const endsAt = normalizeBookingDate(body?.endsAt);
  const durationMinutes = Number(body?.durationMinutes ?? 60);
  const serviceType = parseBookingService(body?.serviceType);
  const requiresConsent = bookingRequiresConsent(serviceType);

  if (appUser.role === 'client') {
    const hasFirstSession = await hasBookedFreeFirstSession(appUser);

    if (serviceType === 'free' && hasFirstSession) {
      return NextResponse.json(
        {
          error: 'Your free first session is already on file. Choose a paid session or package.',
          redirectUrl: appUrl(RETURNING_MEMBER_BOOKING_PATH),
        },
        { status: 409 }
      );
    }

    // First-time clients can now select a paid package inside the guided first-session flow.
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

  const communicationPreference = normalizeCommunicationPreference(body?.communicationPreference);
  const clientPhone = typeof body?.clientPhone === 'string' ? body.clientPhone : appUser.phone;
  if (communicationPreference === 'text' && !normalizeClientPhoneInput(clientPhone)) {
    return NextResponse.json({ error: 'Enter a valid mobile number for text confirmations.' }, { status: 400 });
  }

  const availability = await assertSlotAvailable(startsAt.toISOString(), endsAt.toISOString());
  if (!availability.ok) {
    return NextResponse.json({ error: availability.reason }, { status: 409 });
  }

  const booking = await createBookingHold({
    appUserId: appUser.id,
    clerkUserId: appUser.clerk_user_id,
    clientEmail: appUser.email,
    clientName: typeof body?.clientName === 'string' && body.clientName.trim() ? body.clientName.trim() : appUser.full_name,
    clientPhone,
    communicationPreference,
    serviceType,
    consentAcknowledged: requiresConsent ? true : undefined,
    consentFormUrl: requiresConsent ? BOOKING_CONSENT_FORM_URL : undefined,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    durationMinutes,
  });

  if (serviceType === 'free') {
    const googleEventId = await ensureGoogleEvent(booking);
    const notice = await sendBookingCompletionNotice(booking, {
      calendarStatus: googleEventId ? 'created' : 'pending',
    });
    return NextResponse.json({
      ok: true,
      status: 'confirmed',
      bookingId: booking.id,
      calendarStatus: googleEventId ? 'created' : 'pending',
      notice,
      redirectUrl: appUrl('/book?booking=confirmed&intent=first-session'),
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
    success_url: appUrl('/book?booking=success&intent=first-session&session_id={CHECKOUT_SESSION_ID}'),
    cancel_url: appUrl('/book?booking=cancelled&intent=first-session'),
  });

  await attachStripeSession(booking.id, checkoutSession);

  return NextResponse.json({
    ok: true,
    status: 'pending_payment',
    bookingId: booking.id,
    checkoutUrl: checkoutSession.url,
  });
}
