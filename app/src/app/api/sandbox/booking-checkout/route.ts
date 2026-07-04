import { NextResponse } from 'next/server';
import { BOOKING_SERVICES, parseBookingService } from '@/lib/bookingServices';

export const runtime = 'nodejs';

type CheckoutBody = {
  serviceType?: unknown;
};

export async function POST(req: Request) {
  const origin = new URL(req.url).origin;
  const body = (await req.json().catch(() => null)) as CheckoutBody | null;
  const serviceType = parseBookingService(body?.serviceType);
  const service = BOOKING_SERVICES[serviceType];

  if (service.paymentMode === 'free') {
    return NextResponse.json({
      ok: true,
      status: 'confirmed',
      bookingId: 'sandbox_free_session',
      calendarStatus: 'created',
      notice: {
        channel: 'email',
        provider: 'sandbox',
        status: 'sent',
      },
      redirectUrl: `${origin}/sandbox/first-session-booking?booking=confirmed`,
    });
  }

  return NextResponse.json({
    ok: true,
    status: 'pending_payment',
    bookingId: 'sandbox_paid_session',
    checkoutUrl: `${origin}/sandbox/stripe-checkout?session=cs_test_sandbox_booking_preview`,
  });
}
