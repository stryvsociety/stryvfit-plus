import Stripe from 'stripe';
import { buildAvailableTimes } from '@/lib/bookingAvailability';
import { getBookingAvailability, slotPartsInBookingTz } from '@/lib/bookingAvailabilityStore';
import { BOOKING_CONSENT_FORM_URL, bookingRequiresConsent } from '@/lib/bookingConsent';
import { BOOKING_SERVICES, getStripePriceId, type BookingServiceType } from '@/lib/bookingServices';
import { captureServerIncident } from '@/lib/serverIncidents';
import {
  calendarEventExists,
  createCalendarEvent,
  deleteCalendarEvent,
  listBusyWindows,
} from '@/lib/googleCalendarOfficial';
import { serviceClient } from '@/lib/supabase';

export type BookingStatus =
  | 'held'
  | 'pending_payment'
  | 'confirmed'
  | 'cancelled'
  | 'rescheduled'
  | 'completed'
  | 'no_show'
  | 'expired';

export type BookingRow = {
  id: string;
  app_user_id: string | null;
  clerk_user_id: string | null;
  service_type: BookingServiceType;
  status: BookingStatus;
  starts_at: string;
  ends_at: string;
  duration_minutes: number;
  client_email: string | null;
  client_name: string | null;
  stripe_checkout_session_id: string | null;
  google_event_id: string | null;
};

export type AdminBookingSummary = {
  id: string;
  serviceType: BookingServiceType;
  serviceLabel: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  clientName: string | null;
  clientEmail: string | null;
  googleEventId: string | null;
};

type CreateBookingInput = {
  appUserId: string;
  clerkUserId: string;
  clientEmail: string;
  clientName: string | null;
  serviceType: BookingServiceType;
  consentAcknowledged?: boolean;
  consentFormUrl?: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

const BOOKING_SELECT =
  'id, app_user_id, clerk_user_id, service_type, status, starts_at, ends_at, duration_minutes, client_email, client_name, stripe_checkout_session_id, google_event_id';

function overlaps(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart < bEnd && bStart < aEnd;
}

export function normalizeBookingDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildBookingMetadata(input: {
  serviceType: BookingServiceType;
  consentAcknowledged?: boolean;
  consentFormUrl?: string;
  consentAcknowledgedAt?: string;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = { source: 'stryvfit-booking-flow' };
  if (bookingRequiresConsent(input.serviceType)) {
    metadata.consent = {
      required: true,
      acknowledged: input.consentAcknowledged === true,
      formUrl: input.consentFormUrl ?? BOOKING_CONSENT_FORM_URL,
      acknowledgedAt: input.consentAcknowledged ? input.consentAcknowledgedAt ?? new Date().toISOString() : null,
    };
  }
  return metadata;
}

export async function expireStaleHolds() {
  const sb = serviceClient();
  const now = new Date().toISOString();
  const { error } = await sb
    .from('bookings')
    .update({ status: 'expired', updated_at: now })
    .eq('status', 'pending_payment')
    .lt('hold_expires_at', now);
  if (error) throw error;
}

function holdIsActive(row: { status: string; hold_expires_at: string | null }): boolean {
  if (row.status !== 'pending_payment') return true;
  if (!row.hold_expires_at) return true;
  return new Date(row.hold_expires_at) > new Date();
}

async function assertTrainerSlotAllowed(
  startsAt: string,
  endsAt: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const durationMinutes = Math.round((end.getTime() - start.getTime()) / 60_000);
  if (![30, 45, 60, 90, 120].includes(durationMinutes)) {
    return { ok: false, reason: 'invalid booking window' };
  }

  const availability = await getBookingAvailability();
  const { dateKey, time } = slotPartsInBookingTz(startsAt);
  const allowedStarts = buildAvailableTimes(availability, durationMinutes);
  if (!allowedStarts.includes(time)) {
    return { ok: false, reason: 'That time is outside trainer availability.' };
  }
  if ((availability.blockedSlots[dateKey] ?? []).includes(time)) {
    return { ok: false, reason: 'That time is blocked by your coach.' };
  }
  return { ok: true };
}

export async function assertSlotAvailable(
  startsAt: string,
  endsAt: string,
  options?: { skipHoldExpiry?: boolean }
) {
  if (!options?.skipHoldExpiry) {
    await expireStaleHolds();
  }

  const trainerRules = await assertTrainerSlotAllowed(startsAt, endsAt);
  if (!trainerRules.ok) return trainerRules;

  const sb = serviceClient();
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  const windowStart = new Date(start);
  windowStart.setUTCHours(0, 0, 0, 0);
  const windowEnd = new Date(start);
  windowEnd.setUTCHours(23, 59, 59, 999);

  const { data, error } = await sb
    .from('bookings')
    .select('id, starts_at, ends_at, status, hold_expires_at')
    .gte('starts_at', windowStart.toISOString())
    .lte('starts_at', windowEnd.toISOString())
    .in('status', ['held', 'pending_payment', 'confirmed']);

  if (error) throw error;

  const activeBookings = (data ?? []).filter((booking) =>
    holdIsActive({
      status: String(booking.status),
      hold_expires_at: (booking.hold_expires_at as string | null) ?? null,
    })
  );

  const internalConflict = activeBookings.some((booking) =>
    overlaps(start, end, new Date(String(booking.starts_at)), new Date(String(booking.ends_at)))
  );
  if (internalConflict) {
    return { ok: false as const, reason: 'That slot was just taken. Pick another block.' };
  }

  const busy = await listBusyWindows(startsAt, endsAt);
  const calendarConflict = busy.some((item) => overlaps(start, end, new Date(item.start), new Date(item.end)));
  if (calendarConflict) {
    return { ok: false as const, reason: 'Google Calendar shows that block as busy.' };
  }

  return { ok: true as const };
}

export async function createBookingHold(input: CreateBookingInput): Promise<BookingRow> {
  const sb = serviceClient();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
  const service = BOOKING_SERVICES[input.serviceType];
  const status: BookingStatus = service.paymentMode === 'free' ? 'confirmed' : 'pending_payment';

  const { data, error } = await sb
    .from('bookings')
    .insert({
      app_user_id: input.appUserId,
      clerk_user_id: input.clerkUserId,
      service_type: input.serviceType,
      status,
      starts_at: input.startsAt,
      ends_at: input.endsAt,
      duration_minutes: input.durationMinutes,
      timezone: process.env.BOOKING_TIMEZONE ?? 'America/New_York',
      client_email: input.clientEmail,
      client_name: input.clientName,
      hold_expires_at: status === 'pending_payment' ? expiresAt : null,
      metadata: buildBookingMetadata({
        serviceType: input.serviceType,
        consentAcknowledged: input.consentAcknowledged,
        consentFormUrl: input.consentFormUrl,
      }),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as BookingRow;
}

function toAdminBookingSummary(row: BookingRow): AdminBookingSummary {
  return {
    id: row.id,
    serviceType: row.service_type,
    serviceLabel: BOOKING_SERVICES[row.service_type].label,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMinutes: row.duration_minutes,
    clientName: row.client_name,
    clientEmail: row.client_email,
    googleEventId: row.google_event_id,
  };
}

async function reportBookingIncident(input: {
  route: string;
  message: string;
  context?: Record<string, unknown>;
  adminAction: string;
}) {
  try {
    await captureServerIncident({
      source: 'api',
      route: input.route,
      severity: 'high',
      message: input.message,
      context: input.context,
      admin_action: input.adminAction,
    });
  } catch {
    // Keep admin booking screens available even if support incident capture is unavailable.
  }
}

async function markBookingCancelled(bookingId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await serviceClient()
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: now,
      updated_at: now,
    })
    .eq('id', bookingId);

  if (error) throw error;
}

async function reconcileCalendarDeletedBookings(rows: BookingRow[]): Promise<BookingRow[]> {
  const reconciled = await Promise.all(
    rows.map(async (row) => {
      if (!row.google_event_id) return row;

      const exists = await calendarEventExists(row.google_event_id);
      if (exists !== false) return row;

      try {
        await markBookingCancelled(row.id);
      } catch (error) {
        await reportBookingIncident({
          route: '/admin/pulse',
          message: error instanceof Error ? error.message : 'Unable to cancel Google-deleted booking locally',
          context: { bookingId: row.id, googleEventId: row.google_event_id },
          adminAction: 'A Google event was removed, but the matching Solvys booking could not be cancelled automatically.',
        });
      }

      return null;
    })
  );

  return reconciled.filter((row): row is BookingRow => row !== null);
}

function bookingSortValue(booking: AdminBookingSummary): number {
  const startsAt = new Date(booking.startsAt).getTime();
  if (Number.isNaN(startsAt)) return Number.MAX_SAFE_INTEGER;

  const now = Date.now();
  if (startsAt >= now) return startsAt;

  // Keep recent past bookings visible after upcoming bookings instead of hiding them.
  return Number.MAX_SAFE_INTEGER - startsAt;
}

export async function listAdminBookings(limit = 30): Promise<AdminBookingSummary[]> {
  await expireStaleHolds();

  const { data, error } = await serviceClient()
    .from('bookings')
    .select(BOOKING_SELECT)
    .in('status', ['held', 'pending_payment', 'confirmed', 'rescheduled'])
    .order('starts_at', { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = await reconcileCalendarDeletedBookings((data ?? []) as BookingRow[]);

  return rows
    .map(toAdminBookingSummary)
    .sort((a, b) => bookingSortValue(a) - bookingSortValue(b));
}

export async function cancelBooking(bookingId: string): Promise<{
  booking: AdminBookingSummary;
  calendarDeleted: boolean;
  calendarWarning?: string;
}> {
  const { data, error } = await serviceClient()
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Booking not found');

  const row = data as BookingRow;
  let calendarDeleted = false;
  let calendarWarning: string | undefined;

  if (row.google_event_id) {
    const result = await deleteCalendarEvent(row.google_event_id);
    calendarDeleted = result.ok;
    if (!result.ok) calendarWarning = result.reason;
  }

  await markBookingCancelled(row.id);

  return {
    booking: toAdminBookingSummary({ ...row, status: 'cancelled' }),
    calendarDeleted,
    calendarWarning,
  };
}

export async function attachStripeSession(bookingId: string, session: Stripe.Checkout.Session) {
  const sb = serviceClient();
  const { error } = await sb
    .from('bookings')
    .update({
      stripe_checkout_session_id: session.id,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId);
  if (error) throw error;
}

export async function confirmBookingFromStripe(session: Stripe.Checkout.Session): Promise<BookingRow | null> {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) return null;

  const sb = serviceClient();
  const { data, error } = await sb
    .from('bookings')
    .update({
      status: 'confirmed',
      stripe_checkout_session_id: session.id,
      stripe_customer_id: typeof session.customer === 'string' ? session.customer : null,
      stripe_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : null,
      stripe_subscription_id: typeof session.subscription === 'string' ? session.subscription : null,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .select('*')
    .single();

  if (error) throw error;
  return data as BookingRow;
}

export async function expireBookingForStripeSession(sessionId: string) {
  const sb = serviceClient();
  const { error } = await sb
    .from('bookings')
    .update({ status: 'expired', updated_at: new Date().toISOString() })
    .eq('stripe_checkout_session_id', sessionId)
    .in('status', ['held', 'pending_payment']);
  if (error) throw error;
}

export async function ensureGoogleEvent(booking: BookingRow) {
  if (booking.google_event_id) return booking.google_event_id;

  const service = BOOKING_SERVICES[booking.service_type];
  const googleEventId = await createCalendarEvent({
    bookingId: booking.id,
    title: `StryvFit+: ${service.label}`,
    description: service.description,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    attendeeEmail: booking.client_email,
    attendeeName: booking.client_name,
  });

  if (!googleEventId) return null;

  const sb = serviceClient();
  const { error } = await sb
    .from('bookings')
    .update({
      google_event_id: googleEventId,
      google_calendar_id: process.env.GOOGLE_CALENDAR_ID ?? 'primary',
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id);
  if (error) throw error;
  return googleEventId;
}

export function priceIdForService(serviceType: BookingServiceType): string | null {
  return getStripePriceId(BOOKING_SERVICES[serviceType]);
}
