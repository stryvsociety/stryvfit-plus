import { NextResponse } from 'next/server';
import type Stripe from 'stripe';
import {
  assertSlotAvailable,
  attachStripeSession,
  confirmFreeSessionBooking,
  createBookingHold,
  expireBookingHold,
  expireStaleHolds,
  ensureGoogleEvent,
  findActiveBookingForExactSlot,
  normalizeBookingDate,
  normalizeClientPhoneInput,
  priceIdForService,
  type BookingRow,
  type BookingCommunicationPreference,
} from '@/lib/bookings';
import { createFreeFirstSessionInvoice } from '@/lib/billing';
import { BOOKING_SERVICES, parseBookingService } from '@/lib/bookingServices';
import { BOOKING_CONSENT_FORM_URL, bookingRequiresConsent } from '@/lib/bookingConsent';
import { hasBookedFreeFirstSession, requireApiUser, type AppUser } from '@/lib/auth';
import { RETURNING_MEMBER_BOOKING_PATH } from '@/lib/routes';
import { sendBookingCompletionNotice } from '@/lib/bookingNotifications';
import { captureServerIncident } from '@/lib/serverIncidents';
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

async function reportBookingCheckoutFailure(input: {
  booking: BookingRow;
  stage: 'free-session Stripe invoice' | 'Stripe Checkout' | 'checkout recovery';
  error: unknown;
}) {
  try {
    await captureServerIncident({
      source: 'api',
      route: '/api/bookings/checkout',
      severity: 'high',
      message: `Booking ${input.stage} failed.`,
      context: {
        bookingId: input.booking.id,
        serviceType: input.booking.service_type,
        bookingStatus: input.booking.status,
        technicalMessage: input.error instanceof Error ? input.error.message : 'Unknown error',
      },
      admin_action: 'Inspect the Stripe booking handoff and restore the client only after the booking record is reconciled.',
    });
  } catch {
    // A support-recording failure must not change the booking outcome presented to the client.
  }
}

async function completeFreeSessionBooking(appUser: AppUser, booking: BookingRow) {
  let confirmedBooking: BookingRow | null = booking.status === 'confirmed' ? booking : null;

  try {
    const { invoice, customerId, reused } = await createFreeFirstSessionInvoice(appUser, booking.id, {
      name: booking.client_name,
      phone: booking.client_phone,
    });
    confirmedBooking =
      booking.status === 'confirmed' &&
      booking.stripe_invoice_id === invoice.id &&
      booking.stripe_customer_id === customerId
        ? booking
        : await confirmFreeSessionBooking({
            bookingId: booking.id,
            customerId,
            invoiceId: invoice.id,
          });
    const googleEventId = await ensureGoogleEvent(confirmedBooking);
    const notice = await sendBookingCompletionNotice(confirmedBooking, {
      calendarStatus: googleEventId ? 'created' : 'pending',
    });
    return NextResponse.json({
      ok: true,
      status: 'confirmed',
      bookingId: confirmedBooking.id,
      calendarStatus: googleEventId ? 'created' : 'pending',
      notice,
      stripeInvoiceId: invoice.id,
      stripeInvoiceUrl: invoice.hosted_invoice_url,
      stripeInvoiceReused: reused,
      redirectUrl: appUrl('/book?booking=confirmed&intent=first-session'),
    });
  } catch (error) {
    if (!confirmedBooking) {
      await expireBookingHold(booking.id).catch(() => undefined);
    }
    await reportBookingCheckoutFailure({ booking, stage: 'free-session Stripe invoice', error });
    return NextResponse.json(
      {
        error: confirmedBooking
          ? 'Your session is confirmed, but the calendar handoff needs a refresh. Reload this page in a moment.'
          : 'Unable to confirm the free session right now. Your time was released; please try again.',
      },
      { status: 502 }
    );
  }
}

async function recoverCheckoutUrl(booking: BookingRow) {
  if (booking.status === 'confirmed') {
    return NextResponse.json({
      ok: true,
      status: 'confirmed',
      bookingId: booking.id,
      redirectUrl: appUrl('/book?booking=confirmed&intent=first-session'),
    });
  }
  if (booking.status !== 'pending_payment' || !booking.stripe_checkout_session_id) return null;

  let checkoutSession: Stripe.Checkout.Session;
  try {
    checkoutSession = await stripe().checkout.sessions.retrieve(booking.stripe_checkout_session_id);
  } catch (error) {
    await reportBookingCheckoutFailure({ booking, stage: 'checkout recovery', error });
    return NextResponse.json(
      { error: 'Unable to restore secure checkout right now. Please try again.' },
      { status: 502 }
    );
  }
  if (checkoutSession.status === 'open' && checkoutSession.url) {
    return NextResponse.json({
      ok: true,
      status: 'pending_payment',
      bookingId: booking.id,
      checkoutUrl: checkoutSession.url,
      checkoutReused: true,
    });
  }

  await expireBookingHold(booking.id);
  return null;
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

  await expireStaleHolds();
  const existingBooking = await findActiveBookingForExactSlot({
    appUserId: appUser.id,
    serviceType,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  });
  if (existingBooking) {
    if (serviceType === 'free') return completeFreeSessionBooking(appUser, existingBooking);

    const recovery = await recoverCheckoutUrl(existingBooking);
    if (recovery) return recovery;
  }

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

  const availability = await assertSlotAvailable(startsAt.toISOString(), endsAt.toISOString(), { skipHoldExpiry: true });
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
    initialStatus: serviceType === 'free' ? 'held' : undefined,
  });

  if (serviceType === 'free') {
    return completeFreeSessionBooking(appUser, booking);
  }

  const priceId = priceIdForService(serviceType);
  if (!priceId) {
    return NextResponse.json({ error: `Stripe price is not configured for ${serviceType}` }, { status: 500 });
  }
  const service = BOOKING_SERVICES[serviceType];

  try {
    const checkoutSession = await stripe().checkout.sessions.create(
      {
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
      },
      { idempotencyKey: `stryvfit-checkout:${booking.id}` }
    );

    if (!checkoutSession.url) {
      throw new Error('Stripe did not return a checkout URL.');
    }

    await attachStripeSession(booking.id, checkoutSession);

    return NextResponse.json({
      ok: true,
      status: 'pending_payment',
      bookingId: booking.id,
      checkoutUrl: checkoutSession.url,
    });
  } catch (error) {
    await expireBookingHold(booking.id).catch(() => undefined);
    await reportBookingCheckoutFailure({ booking, stage: 'Stripe Checkout', error });
    return NextResponse.json(
      { error: 'Unable to open secure checkout right now. Your time was released; please try again.' },
      { status: 502 }
    );
  }
}
