import Stripe from 'stripe';
import { syncStripeSessionBilling } from '@/lib/billing';
import { buildAvailableTimesForDate } from '@/lib/bookingAvailability';
import { getBookingAvailability, slotPartsInBookingTz } from '@/lib/bookingAvailabilityStore';
import { BOOKING_CONSENT_FORM_URL, bookingRequiresConsent } from '@/lib/bookingConsent';
import {
  BOOKING_SERVICES,
  getStripePriceId,
  parseBookingService,
  type BookingServiceType,
} from '@/lib/bookingServices';
import { captureServerIncident } from '@/lib/serverIncidents';
import {
  calendarEventExists,
  createCalendarEvent,
  deleteCalendarEvent,
  listUpcomingCalendarEvents,
  type GoogleCalendarImportedEvent,
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
  client_phone: string | null;
  stripe_checkout_session_id: string | null;
  google_event_id: string | null;
};

export type AdminBookingSummary = {
  id: string;
  source?: 'app' | 'google_calendar';
  serviceType: BookingServiceType;
  serviceLabel: string;
  status: BookingStatus;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  googleEventId: string | null;
};

export type AdminClientSummary = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  status: string;
  goal: string;
  payment: string;
  manual?: boolean;
};

type CreateBookingInput = {
  appUserId: string;
  clerkUserId: string;
  clientEmail: string;
  clientName: string | null;
  clientPhone?: string | null;
  serviceType: BookingServiceType;
  consentAcknowledged?: boolean;
  consentFormUrl?: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
};

export type UpdateBookingInput = {
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  serviceType?: unknown;
  status?: unknown;
  startsAt?: string;
  durationMinutes?: number;
};

export type CreateAdminClientInput = {
  fullName?: unknown;
  email?: unknown;
  phone?: unknown;
  existingClient?: unknown;
};

const BOOKING_SELECT =
  'id, app_user_id, clerk_user_id, service_type, status, starts_at, ends_at, duration_minutes, client_email, client_name, client_phone, stripe_checkout_session_id, google_event_id';
const APP_USER_SELECT =
  'id, clerk_user_id, email, full_name, phone, role, stripe_customer_id, stripe_subscription_id, subscription_status';

const BOOKING_STATUSES: BookingStatus[] = [
  'held',
  'pending_payment',
  'confirmed',
  'cancelled',
  'rescheduled',
  'completed',
  'no_show',
  'expired',
];

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
  const allowedStarts = buildAvailableTimesForDate(availability, durationMinutes, dateKey);
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
      client_phone: normalizeClientPhoneInput(input.clientPhone),
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
    source: 'app',
    serviceType: row.service_type,
    serviceLabel: BOOKING_SERVICES[row.service_type].label,
    status: row.status,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    durationMinutes: row.duration_minutes,
    clientName: row.client_name,
    clientEmail: row.client_email,
    clientPhone: row.client_phone,
    googleEventId: row.google_event_id,
  };
}

function toImportedCalendarBookingSummary(event: GoogleCalendarImportedEvent): AdminBookingSummary {
  const startsAt = new Date(event.startsAt);
  const endsAt = new Date(event.endsAt);
  const durationMinutes = Math.max(1, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000));

  return {
    id: `calendar:${event.eventId}`,
    source: 'google_calendar',
    serviceType: 'free',
    serviceLabel: event.summary,
    status: 'confirmed',
    startsAt: event.startsAt,
    endsAt: event.endsAt,
    durationMinutes,
    clientName: event.attendeeName ?? event.summary,
    clientEmail: event.attendeeEmail,
    clientPhone: null,
    googleEventId: event.eventId,
  };
}

type AppUserRow = {
  id: string;
  clerk_user_id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role: string;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string | null;
};

function prettyStatus(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function toAdminClientSummary(row: AppUserRow): AdminClientSummary {
  const subscriptionStatus = prettyStatus(row.subscription_status);
  const name = row.full_name?.trim() || row.email;
  const manual = row.clerk_user_id.startsWith('manual:');

  return {
    id: row.id,
    name,
    email: row.email,
    phone: row.phone,
    status: manual ? 'Existing client' : subscriptionStatus ? `Subscription ${subscriptionStatus}` : 'Client account',
    goal: row.stripe_subscription_id ? 'Subscription client' : 'Client profile',
    payment: subscriptionStatus
      ? `Subscription ${subscriptionStatus}`
      : row.stripe_customer_id
        ? 'Billing on file'
        : 'No billing yet',
    manual,
  };
}

function adminClientRosterKey(client: Pick<AdminClientSummary, 'email' | 'name'>): string {
  return (client.email?.trim().toLowerCase() || client.name.trim().toLowerCase()).replace(/\s+/g, ' ');
}

export function adminClientSummariesFromBookings(bookings: AdminBookingSummary[]): AdminClientSummary[] {
  const byKey = new Map<string, AdminClientSummary>();

  for (const booking of bookings) {
    const name = booking.clientName?.trim() || booking.clientEmail?.trim();
    const email = booking.clientEmail?.trim().toLowerCase() || null;
    if (!name && !email) continue;

    const client: AdminClientSummary = {
      id: `booking:${booking.id}`,
      name: name || email || 'Booked client',
      email,
      phone: booking.clientPhone,
      status: booking.status === 'pending_payment' ? 'Payment pending' : 'Booked appointment',
      goal: booking.serviceLabel || 'Appointment client',
      payment: booking.status === 'pending_payment' ? 'Payment pending' : 'Booking history',
    };
    const key = adminClientRosterKey(client);
    if (!byKey.has(key)) byKey.set(key, client);
  }

  return [...byKey.values()];
}

export function mergeAdminClientSummaries(
  primaryClients: AdminClientSummary[],
  fallbackClients: AdminClientSummary[]
): AdminClientSummary[] {
  const byKey = new Map(primaryClients.map((client) => [adminClientRosterKey(client), client]));
  for (const client of fallbackClients) {
    const key = adminClientRosterKey(client);
    if (!byKey.has(key)) byKey.set(key, client);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function manualClerkUserId(seed = crypto.randomUUID()): string {
  return `manual:${seed}`;
}

export function normalizeClientPhoneInput(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const digits = trimmed.replace(/\D/g, '');
  if (trimmed.startsWith('+') && digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  if (digits.length >= 11 && digits.length <= 15) {
    return `+${digits}`;
  }

  throw new Error('Enter a valid mobile number.');
}

export function normalizeAdminClientInput(input: CreateAdminClientInput): {
  fullName: string;
  email: string;
  phone: string | null;
  existingClient: boolean;
} {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid client email.');
  }

  const fullName = typeof input.fullName === 'string' ? input.fullName.trim() : '';

  return {
    email,
    fullName: fullName || email,
    phone: normalizeClientPhoneInput(input.phone),
    existingClient: input.existingClient !== false,
  };
}

export function normalizeAdminClientLimit(value: unknown = 80): number {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 80;
  return Math.min(Math.max(Math.trunc(limit), 1), 200);
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

export async function listAdminClients(limit: unknown = 80): Promise<AdminClientSummary[]> {
  const cappedLimit = normalizeAdminClientLimit(limit);
  const sb = serviceClient();
  const { data, error } = await sb
    .from('app_users')
    .select(APP_USER_SELECT)
    .eq('role', 'client')
    .order('updated_at', { ascending: false })
    .limit(cappedLimit);

  if (error) throw error;
  const profileClients = ((data ?? []) as AppUserRow[]).map(toAdminClientSummary);

  const bookingRows = await sb
    .from('bookings')
    .select(BOOKING_SELECT)
    .in('status', ['held', 'pending_payment', 'confirmed', 'rescheduled', 'completed', 'no_show'])
    .order('starts_at', { ascending: false })
    .limit(Math.max(cappedLimit, 120));

  if (bookingRows.error) throw bookingRows.error;
  const bookedClients = adminClientSummariesFromBookings(((bookingRows.data ?? []) as BookingRow[]).map(toAdminBookingSummary));

  return mergeAdminClientSummaries(profileClients, bookedClients).slice(0, cappedLimit);
}

async function ensureExistingClientAccessBooking(row: AppUserRow): Promise<boolean> {
  const sb = serviceClient();
  const existing = await sb
    .from('bookings')
    .select('id')
    .eq('app_user_id', row.id)
    .eq('service_type', 'free')
    .in('status', ['held', 'pending_payment', 'confirmed', 'rescheduled', 'completed'])
    .limit(1);

  if (existing.error) throw existing.error;
  if ((existing.data?.length ?? 0) > 0) return false;

  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + 60 * 60_000);
  const inserted = await sb.from('bookings').insert({
    app_user_id: row.id,
    clerk_user_id: null,
    service_type: 'free',
    status: 'completed',
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    duration_minutes: 60,
    timezone: process.env.BOOKING_TIMEZONE ?? 'America/New_York',
    client_email: row.email,
    client_name: row.full_name,
    client_phone: row.phone,
    metadata: { source: 'stryvadmin-manual-client', existingClient: true },
  });

  if (inserted.error) throw inserted.error;
  return true;
}

export async function createAdminClient(input: CreateAdminClientInput): Promise<{
  client: AdminClientSummary;
  accessBookingCreated: boolean;
  created: boolean;
}> {
  const normalized = normalizeAdminClientInput(input);
  const sb = serviceClient();
  const existing = await sb
    .from('app_users')
    .select(APP_USER_SELECT)
    .eq('email', normalized.email)
    .maybeSingle();

  if (existing.error) throw existing.error;

  let row: AppUserRow;
  let created = false;
  if (existing.data) {
    if (existing.data.role !== 'client') {
      throw new Error('That email already belongs to a staff account.');
    }

    const updated = await sb
      .from('app_users')
      .update({ full_name: normalized.fullName, phone: normalized.phone, updated_at: new Date().toISOString() })
      .eq('id', existing.data.id)
      .select(APP_USER_SELECT)
      .single();
    if (updated.error) throw updated.error;
    row = updated.data as AppUserRow;
  } else {
    const inserted = await sb
      .from('app_users')
      .insert({
        clerk_user_id: manualClerkUserId(),
        email: normalized.email,
        full_name: normalized.fullName,
        phone: normalized.phone,
        role: 'client',
      })
      .select(APP_USER_SELECT)
      .single();
    if (inserted.error) throw inserted.error;
    row = inserted.data as AppUserRow;
    created = true;
  }

  const accessBookingCreated = normalized.existingClient
    ? await ensureExistingClientAccessBooking(row)
    : false;

  return {
    client: toAdminClientSummary(row),
    accessBookingCreated,
    created,
  };
}

export async function deleteAdminClient(clientId: string): Promise<{ clientId: string }> {
  const { data, error } = await serviceClient()
    .from('app_users')
    .select('id, clerk_user_id, role')
    .eq('id', clientId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Client not found');
  if (data.role !== 'client') {
    throw new Error('Only client profiles can be removed from StryvAdmin.');
  }

  const removed = await serviceClient().from('app_users').delete().eq('id', clientId);
  if (removed.error) throw removed.error;

  return { clientId };
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
  const appGoogleEventIds = new Set(rows.map((row) => row.google_event_id).filter(Boolean));
  const importedEvents = await listUpcomingCalendarEvents(Math.max(limit, 20));
  const importedBookings = importedEvents
    .filter((event) => !event.appBookingId && !appGoogleEventIds.has(event.eventId))
    .map(toImportedCalendarBookingSummary);

  return [...rows.map(toAdminBookingSummary), ...importedBookings]
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

function normalizeEditableStatus(value: unknown, fallback: BookingStatus): BookingStatus {
  return BOOKING_STATUSES.includes(value as BookingStatus) ? (value as BookingStatus) : fallback;
}

function normalizeEditableDuration(value: unknown, fallback: number): number {
  const duration = Number(value);
  return [30, 45, 60, 90, 120].includes(duration) ? duration : fallback;
}

export async function updateBooking(
  bookingId: string,
  input: UpdateBookingInput
): Promise<{ booking: AdminBookingSummary; calendarWarning?: string }> {
  const { data, error } = await serviceClient()
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Booking not found');

  const row = data as BookingRow;
  const durationMinutes = normalizeEditableDuration(input.durationMinutes, row.duration_minutes);
  const startsAt = input.startsAt ? normalizeBookingDate(input.startsAt) : new Date(row.starts_at);
  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    throw new Error('Appointment date is invalid');
  }

  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);
  const updates = {
    client_name: input.clientName === undefined ? row.client_name : input.clientName?.trim() || null,
    client_email:
      input.clientEmail === undefined ? row.client_email : input.clientEmail?.trim().toLowerCase() || null,
    client_phone:
      input.clientPhone === undefined ? row.client_phone : normalizeClientPhoneInput(input.clientPhone),
    service_type: input.serviceType === undefined ? row.service_type : parseBookingService(input.serviceType),
    status: normalizeEditableStatus(input.status, row.status),
    starts_at: startsAt.toISOString(),
    ends_at: endsAt.toISOString(),
    duration_minutes: durationMinutes,
    updated_at: new Date().toISOString(),
  };

  const updated = await serviceClient()
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select(BOOKING_SELECT)
    .single();

  if (updated.error) throw updated.error;

  return {
    booking: toAdminBookingSummary(updated.data as BookingRow),
    calendarWarning: row.google_event_id
      ? 'Update the matching Google Calendar event if the date or time changed.'
      : undefined,
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
  await syncStripeSessionBilling(session);
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
