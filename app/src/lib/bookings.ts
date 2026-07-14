import Stripe from 'stripe';
import { syncStripeSessionBilling } from '@/lib/billing';
import { sendBookingCompletionNotice } from '@/lib/bookingNotifications';
import { buildAvailableTimesForDate } from '@/lib/bookingAvailability';
import { getBookingAvailability, slotPartsInBookingTz } from '@/lib/bookingAvailabilityStore';
import { BOOKING_CONSENT_FORM_URL, bookingRequiresConsent } from '@/lib/bookingConsent';
import {
  BOOKING_SERVICES,
  getStripePriceId,
  parseBookingService,
  type BookingService,
  type BookingServiceType,
} from '@/lib/bookingServices';
import {
  clientLifecycleFromHistory,
  clientLifecycleLabel,
  type ClientLifecycle,
  type ClientLifecycleBooking,
} from '@/lib/clientLifecycle';
import { captureServerIncident } from '@/lib/serverIncidents';
import {
  calendarEventExists,
  createCalendarEvent,
  deleteCalendarEvent,
  listUpcomingCalendarEvents,
  type GoogleCalendarImportedEvent,
  listBusyWindows,
  updateCalendarEvent,
} from '@/lib/googleCalendarOfficial';
import { stripe } from '@/lib/stripeClient';
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

export type BookingCommunicationPreference = 'email' | 'text';

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
  stripe_invoice_id: string | null;
  stripe_customer_id: string | null;
  google_event_id: string | null;
  metadata: Record<string, unknown>;
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
  lifecycle: ClientLifecycle;
  status: string;
  goal: string;
  payment: string;
  profileGoal?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  manual?: boolean;
};

export type ClientBookingSummary = AdminBookingSummary & {
  canCancel: boolean;
  lateCancellation: boolean;
  lateCancellationBlocked: boolean;
};

const ARCHIVED_BOOKING_SERVICE: BookingService = {
  type: 'free',
  label: 'Archived session',
  description: 'This retired service is no longer available for booking.',
  paymentMode: 'free',
};

function bookingServiceForType(serviceType: string): BookingService {
  return BOOKING_SERVICES[serviceType as BookingServiceType] ?? ARCHIVED_BOOKING_SERVICE;
}

type CreateBookingInput = {
  appUserId: string;
  clerkUserId: string;
  clientEmail: string;
  clientName: string | null;
  clientPhone?: string | null;
  communicationPreference?: BookingCommunicationPreference;
  serviceType: BookingServiceType;
  consentAcknowledged?: boolean;
  consentFormUrl?: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  initialStatus?: 'held' | 'pending_payment' | 'confirmed';
};

export type CreateAdminBookingInput = {
  clientId?: unknown;
  clientName?: unknown;
  clientEmail?: unknown;
  clientPhone?: unknown;
  serviceType?: unknown;
  startsAt?: unknown;
  durationMinutes?: unknown;
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

export type UpdateClientProfileInput = {
  fullName?: unknown;
  phone?: unknown;
  profileGoal?: unknown;
  emergencyContactName?: unknown;
  emergencyContactPhone?: unknown;
};

const BOOKING_SELECT =
  'id, app_user_id, clerk_user_id, service_type, status, starts_at, ends_at, duration_minutes, client_email, client_name, client_phone, stripe_checkout_session_id, stripe_invoice_id, stripe_customer_id, google_event_id, metadata';
const APP_USER_SELECT =
  'id, clerk_user_id, email, full_name, phone, role, stripe_customer_id, stripe_subscription_id, subscription_status, profile_goal, emergency_contact_name, emergency_contact_phone';

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
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

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
  communicationPreference?: BookingCommunicationPreference;
  communicationEmail?: string | null;
  communicationPhone?: string | null;
  consentAcknowledged?: boolean;
  consentFormUrl?: string;
  consentAcknowledgedAt?: string;
}): Record<string, unknown> {
  const metadata: Record<string, unknown> = { source: 'stryvfit-booking-flow' };
  metadata.communication = {
    preferredChannel: input.communicationPreference ?? 'email',
    email: input.communicationEmail?.trim().toLowerCase() || null,
    phone: normalizeClientPhoneInput(input.communicationPhone),
    selectedAt: new Date().toISOString(),
  };
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
    .in('status', ['held', 'pending_payment'])
    .lt('hold_expires_at', now);
  if (error) throw error;
}

export function bookingHoldIsActive(row: { status: string; hold_expires_at: string | null }): boolean {
  if (row.status !== 'held' && row.status !== 'pending_payment') return true;
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
    bookingHoldIsActive({
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
  const status: BookingStatus = input.initialStatus ?? (service.paymentMode === 'free' ? 'confirmed' : 'pending_payment');

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
      hold_expires_at: status === 'held' || status === 'pending_payment' ? expiresAt : null,
      metadata: buildBookingMetadata({
        serviceType: input.serviceType,
        communicationPreference: input.communicationPreference,
        communicationEmail: input.clientEmail,
        communicationPhone: input.clientPhone,
        consentAcknowledged: input.consentAcknowledged,
        consentFormUrl: input.consentFormUrl,
      }),
    })
    .select('*')
    .single();

  if (error) throw error;
  return data as BookingRow;
}

export async function findActiveBookingForExactSlot(input: {
  appUserId: string;
  serviceType: BookingServiceType;
  startsAt: string;
  endsAt: string;
}): Promise<BookingRow | null> {
  const { data, error } = await serviceClient()
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('app_user_id', input.appUserId)
    .eq('service_type', input.serviceType)
    .eq('starts_at', input.startsAt)
    .eq('ends_at', input.endsAt)
    .in('status', ['held', 'pending_payment', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? (data as BookingRow) : null;
}

export async function findActiveBookingForSlot(input: {
  appUserId: string;
  startsAt: string;
  endsAt: string;
}): Promise<BookingRow | null> {
  const { data, error } = await serviceClient()
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('app_user_id', input.appUserId)
    .eq('starts_at', input.startsAt)
    .eq('ends_at', input.endsAt)
    .in('status', ['held', 'pending_payment', 'confirmed'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? (data as BookingRow) : null;
}

export async function confirmFreeSessionBooking(input: {
  bookingId: string;
  customerId: string;
  invoiceId: string;
}): Promise<BookingRow> {
  const updated = await serviceClient()
    .from('bookings')
    .update({
      status: 'confirmed',
      stripe_customer_id: input.customerId,
      stripe_invoice_id: input.invoiceId,
      hold_expires_at: null,
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.bookingId)
    .select('*')
    .single();

  if (updated.error) throw updated.error;
  return updated.data as BookingRow;
}

export async function expireBookingHold(bookingId: string): Promise<void> {
  const { error } = await serviceClient()
    .from('bookings')
    .update({ status: 'expired', hold_expires_at: null, updated_at: new Date().toISOString() })
    .eq('id', bookingId)
    .in('status', ['held', 'pending_payment']);
  if (error) throw error;
}

function toAdminBookingSummary(row: BookingRow): AdminBookingSummary {
  return {
    id: row.id,
    source: 'app',
    serviceType: row.service_type,
    serviceLabel: bookingServiceForType(row.service_type).label,
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
  profile_goal: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
};

type ClientLifecycleBookingRow = ClientLifecycleBooking & {
  app_user_id: string | null;
  client_email: string | null;
};

function prettyStatus(value: string | null): string | null {
  if (!value) return null;
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function clientLifecycleGoal(lifecycle: ClientLifecycle, row: AppUserRow): string {
  if (row.profile_goal?.trim()) return row.profile_goal.trim();
  if (row.stripe_subscription_id) return 'Subscription client';
  if (lifecycle === 'new') return 'First session pending';
  if (lifecycle === 'first_session_booked') return 'First session scheduled';
  if (lifecycle === 'existing') return 'Imported existing client';
  return 'Post-session client';
}

function clientLifecycleStatus(lifecycle: ClientLifecycle, row: AppUserRow): string {
  const subscriptionStatus = prettyStatus(row.subscription_status);
  if (lifecycle === 'returning' && subscriptionStatus) return `Returning / ${subscriptionStatus}`;
  if (lifecycle === 'existing') return 'Existing client';
  if (lifecycle === 'first_session_booked') return 'First session booked';
  if (lifecycle === 'new') return 'New client';
  return 'Returning client';
}

function clientLifecyclePayment(row: AppUserRow): string {
  const subscriptionStatus = prettyStatus(row.subscription_status);
  if (subscriptionStatus) return `Subscription ${subscriptionStatus}`;
  if (row.stripe_customer_id) return 'Billing on file';
  return 'No billing yet';
}

function toAdminClientSummary(row: AppUserRow, bookingHistory: ClientLifecycleBooking[] = []): AdminClientSummary {
  const subscriptionStatus = prettyStatus(row.subscription_status);
  const name = row.full_name?.trim() || row.email;
  const manual = row.clerk_user_id.startsWith('manual:');
  const lifecycle = clientLifecycleFromHistory({
    manual,
    hasSubscription: Boolean(row.stripe_subscription_id || subscriptionStatus),
    bookings: bookingHistory,
  });

  return {
    id: row.id,
    name,
    email: row.email,
    phone: row.phone,
    lifecycle,
    status: clientLifecycleStatus(lifecycle, row),
    goal: clientLifecycleGoal(lifecycle, row),
    payment: clientLifecyclePayment(row),
    profileGoal: row.profile_goal,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    manual,
  };
}

function adminClientRosterKey(client: Pick<AdminClientSummary, 'email' | 'name'>): string {
  return (client.email?.trim().toLowerCase() || client.name.trim().toLowerCase()).replace(/\s+/g, ' ');
}

function adminClientEmailKey(email: string | null | undefined): string | null {
  return email?.trim().toLowerCase() || null;
}

function adminClientNameKey(name: string | null | undefined): string | null {
  const normalized = name?.trim().toLowerCase().replace(/\s+/g, ' ');
  return normalized || null;
}

export function stryvFitSessionClientName(value: string | null | undefined): string | null {
  const normalized = value?.trim().replace(/\s+/g, ' ');
  if (!normalized) return null;

  const match = normalized.match(/^stryvfit\+\s*(?::|-)?\s*session\s+for\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export function adminBookingClientName(booking: Pick<AdminBookingSummary, 'clientName' | 'clientEmail'>): string {
  const clientName = booking.clientName?.trim();
  return stryvFitSessionClientName(clientName) || clientName || booking.clientEmail?.trim() || 'StryvFit+ client';
}

export function adminClientSummariesFromBookings(bookings: AdminBookingSummary[]): AdminClientSummary[] {
  const byKey = new Map<string, AdminClientSummary>();

  for (const booking of bookings) {
    const rawName = booking.clientName?.trim();
    const email = booking.clientEmail?.trim().toLowerCase() || null;
    const name = rawName ? adminBookingClientName(booking) : booking.clientEmail?.trim();
    if (!name && !email) continue;
    const lifecycle = clientLifecycleFromHistory({
      bookings: [
        {
          service_type: booking.serviceType,
          status: booking.status,
          starts_at: booking.startsAt,
        },
      ],
    });

    const client: AdminClientSummary = {
      id: `booking:${booking.id}`,
      name: name || email || 'Booked client',
      email,
      phone: booking.clientPhone,
      lifecycle,
      status: lifecycle === 'first_session_booked' ? 'First session booked' : 'Booked appointment',
      goal: booking.serviceType === 'free' ? clientLifecycleLabel(lifecycle) : booking.serviceLabel || 'Appointment client',
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
  const byKey = new Map<string, AdminClientSummary>();
  const emailKeys = new Map<string, string>();
  const nameKeys = new Map<string, string>();

  function rememberClient(key: string, client: AdminClientSummary) {
    byKey.set(key, client);

    const emailKey = adminClientEmailKey(client.email);
    if (emailKey) emailKeys.set(emailKey, key);

    const nameKey = adminClientNameKey(client.name);
    if (nameKey) nameKeys.set(nameKey, key);
  }

  for (const client of primaryClients) {
    rememberClient(adminClientRosterKey(client), client);
  }

  for (const client of fallbackClients) {
    const emailKey = adminClientEmailKey(client.email);
    const nameKey = adminClientNameKey(client.name);
    const existingKey = (emailKey ? emailKeys.get(emailKey) : null) || (nameKey ? nameKeys.get(nameKey) : null);
    if (existingKey) continue;

    rememberClient(adminClientRosterKey(client), client);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function bookingHistoryForClient(
  client: AppUserRow,
  bookingRows: ClientLifecycleBookingRow[]
): ClientLifecycleBooking[] {
  const email = client.email.trim().toLowerCase();
  return bookingRows.filter((booking) => {
    if (booking.app_user_id === client.id) return true;
    return booking.client_email?.trim().toLowerCase() === email;
  });
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

function normalizeProfileText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ');
  return normalized || null;
}

export function normalizeClientProfileInput(input: UpdateClientProfileInput): {
  fullName: string | null;
  phone: string | null;
  profileGoal: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
} {
  const fullName = normalizeProfileText(input.fullName);
  const profileGoal = normalizeProfileText(input.profileGoal);
  const emergencyContactName = normalizeProfileText(input.emergencyContactName);

  return {
    fullName,
    phone: normalizeClientPhoneInput(input.phone),
    profileGoal,
    emergencyContactName,
    emergencyContactPhone: normalizeClientPhoneInput(input.emergencyContactPhone),
  };
}

export function normalizeAdminClientLimit(value: unknown = 80): number {
  const limit = Number(value);
  if (!Number.isFinite(limit)) return 80;
  return Math.min(Math.max(Math.trunc(limit), 1), 200);
}

export async function updateClientProfile(
  appUser: Pick<AppUserRow, 'id'>,
  input: UpdateClientProfileInput
): Promise<AppUserRow> {
  const normalized = normalizeClientProfileInput(input);
  const { data, error } = await serviceClient()
    .from('app_users')
    .update({
      full_name: normalized.fullName,
      phone: normalized.phone,
      profile_goal: normalized.profileGoal,
      emergency_contact_name: normalized.emergencyContactName,
      emergency_contact_phone: normalized.emergencyContactPhone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', appUser.id)
    .select(APP_USER_SELECT)
    .single();

  if (error) throw error;
  return data as AppUserRow;
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

type BookingOwner = Pick<AppUserRow, 'id' | 'clerk_user_id' | 'email'>;

const CLIENT_ACTIVE_BOOKING_STATUSES: BookingStatus[] = ['held', 'pending_payment', 'confirmed', 'rescheduled'];
const LATE_CANCELLATION_WINDOW_MS = 24 * 60 * 60 * 1000;

function bookingBelongsToUser(booking: BookingRow, appUser: BookingOwner): boolean {
  const email = appUser.email.trim().toLowerCase();
  return (
    booking.app_user_id === appUser.id ||
    booking.clerk_user_id === appUser.clerk_user_id ||
    booking.client_email?.trim().toLowerCase() === email
  );
}

function isLateBookingChange(startsAt: string, now = new Date()): boolean {
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() - now.getTime() < LATE_CANCELLATION_WINDOW_MS;
}

function cancellationPolicyMetadata(metadata: Record<string, unknown>, input: {
  cancelledAt: string;
  cancelledBy: 'client' | 'admin';
  late: boolean;
  courtesyUsed: boolean;
}): Record<string, unknown> {
  return {
    ...metadata,
    cancellationPolicy: {
      cancelledAt: input.cancelledAt,
      cancelledBy: input.cancelledBy,
      late: input.late,
      courtesyUsed: input.courtesyUsed,
    },
  };
}

function metadataUsedLateCourtesy(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object') return false;
  const policy = (metadata as { cancellationPolicy?: unknown }).cancellationPolicy;
  if (!policy || typeof policy !== 'object') return false;
  return Boolean(
    (policy as { late?: unknown; courtesyUsed?: unknown }).late &&
      (policy as { courtesyUsed?: unknown }).courtesyUsed
  );
}

async function clientBookingRows(
  appUser: BookingOwner,
  statuses: BookingStatus[],
  limit = 30
): Promise<BookingRow[]> {
  const sb = serviceClient();
  const queries = [
    sb.from('bookings').select(BOOKING_SELECT).eq('app_user_id', appUser.id).in('status', statuses).limit(limit),
    sb
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('clerk_user_id', appUser.clerk_user_id)
      .in('status', statuses)
      .limit(limit),
    sb
      .from('bookings')
      .select(BOOKING_SELECT)
      .eq('client_email', appUser.email.trim().toLowerCase())
      .in('status', statuses)
      .limit(limit),
  ];

  const results = await Promise.all(queries);
  for (const result of results) {
    if (result.error) throw result.error;
  }

  const byId = new Map<string, BookingRow>();
  for (const result of results) {
    for (const row of (result.data ?? []) as BookingRow[]) {
      byId.set(row.id, row);
    }
  }

  return [...byId.values()].sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
}

async function lateClientCancellationCount(appUser: BookingOwner, excludeBookingId?: string): Promise<number> {
  const rows = await clientBookingRows(appUser, ['cancelled'], 100);
  return rows.filter((row) => row.id !== excludeBookingId && metadataUsedLateCourtesy(row.metadata)).length;
}

function toClientBookingSummary(
  booking: BookingRow,
  priorLateCancellationCount: number,
  now = new Date()
): ClientBookingSummary {
  const summary = toAdminBookingSummary(booking);
  const upcoming = new Date(booking.starts_at).getTime() > now.getTime();
  const active = CLIENT_ACTIVE_BOOKING_STATUSES.includes(booking.status);
  const lateCancellation = isLateBookingChange(booking.starts_at, now);
  const lateCancellationBlocked = lateCancellation && priorLateCancellationCount > 0;

  return {
    ...summary,
    canCancel: upcoming && active && !lateCancellationBlocked,
    lateCancellation,
    lateCancellationBlocked,
  };
}

export async function listClientBookings(appUser: BookingOwner, limit = 20): Promise<ClientBookingSummary[]> {
  const [rows, priorLateCancellationCount] = await Promise.all([
    clientBookingRows(appUser, CLIENT_ACTIVE_BOOKING_STATUSES, limit),
    lateClientCancellationCount(appUser),
  ]);

  return rows.slice(0, limit).map((row) => toClientBookingSummary(row, priorLateCancellationCount));
}

export async function cancelClientBooking(
  appUser: BookingOwner,
  bookingId: string
): Promise<{ booking: ClientBookingSummary; lateCourtesyUsed: boolean; calendarDeleted: boolean }> {
  const { data, error } = await serviceClient()
    .from('bookings')
    .select(BOOKING_SELECT)
    .eq('id', bookingId)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Booking not found');

  const row = data as BookingRow;
  if (!bookingBelongsToUser(row, appUser)) throw new Error('Booking not found');
  if (!CLIENT_ACTIVE_BOOKING_STATUSES.includes(row.status)) throw new Error('This booking cannot be cancelled.');

  const now = new Date();
  if (new Date(row.starts_at).getTime() <= now.getTime()) {
    throw new Error('Past sessions cannot be cancelled from the app.');
  }

  const lateCancellation = isLateBookingChange(row.starts_at, now);
  const priorLateCancellationCount = await lateClientCancellationCount(appUser, row.id);
  if (lateCancellation && priorLateCancellationCount > 0) {
    throw new Error('This session is inside 24 hours and the courtesy late cancellation has already been used. Message Ashley to change it.');
  }

  let calendarDeleted = false;
  if (row.google_event_id) {
    const result = await deleteCalendarEvent(row.google_event_id);
    if (!result.ok) throw new Error(result.reason);
    calendarDeleted = true;
  }

  const cancelledAt = now.toISOString();
  const metadata = cancellationPolicyMetadata(row.metadata ?? {}, {
    cancelledAt,
    cancelledBy: 'client',
    late: lateCancellation,
    courtesyUsed: lateCancellation,
  });
  const updated = await serviceClient()
    .from('bookings')
    .update({
      status: 'cancelled',
      cancelled_at: cancelledAt,
      metadata,
      updated_at: cancelledAt,
    })
    .eq('id', row.id)
    .select(BOOKING_SELECT)
    .single();

  if (updated.error) throw updated.error;

  return {
    booking: toClientBookingSummary(updated.data as BookingRow, priorLateCancellationCount + (lateCancellation ? 1 : 0), now),
    lateCourtesyUsed: lateCancellation,
    calendarDeleted,
  };
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
  const appUsers = (data ?? []) as AppUserRow[];
  const appUserIds = appUsers.map((row) => row.id);
  const emails = appUsers.map((row) => row.email).filter(Boolean);
  const [bookingsByUser, bookingsByEmail] = await Promise.all([
    appUserIds.length
      ? sb
          .from('bookings')
          .select('app_user_id, client_email, service_type, status, starts_at')
          .in('app_user_id', appUserIds)
      : Promise.resolve({ data: [], error: null }),
    emails.length
      ? sb
          .from('bookings')
          .select('app_user_id, client_email, service_type, status, starts_at')
          .in('client_email', emails)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (bookingsByUser.error) throw bookingsByUser.error;
  if (bookingsByEmail.error) throw bookingsByEmail.error;

  const historyRows = [
    ...((bookingsByUser.data ?? []) as ClientLifecycleBookingRow[]),
    ...((bookingsByEmail.data ?? []) as ClientLifecycleBookingRow[]),
  ];
  const profileClients = appUsers.map((row) => toAdminClientSummary(row, bookingHistoryForClient(row, historyRows)));

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
    client: toAdminClientSummary(row, []),
    accessBookingCreated,
    created,
  };
}

export async function updateAdminClient(
  clientId: string,
  input: CreateAdminClientInput & UpdateClientProfileInput
): Promise<{ client: AdminClientSummary }> {
  const existing = await serviceClient()
    .from('app_users')
    .select(APP_USER_SELECT)
    .eq('id', clientId)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (!existing.data) throw new Error('Client not found');
  if (existing.data.role !== 'client') throw new Error('Only client profiles can be edited in StryvAdmin.');

  const current = existing.data as AppUserRow;
  const normalized = normalizeClientProfileInput({
    fullName: input.fullName ?? current.full_name,
    phone: input.phone ?? current.phone,
    profileGoal: input.profileGoal ?? current.profile_goal,
    emergencyContactName: input.emergencyContactName ?? current.emergency_contact_name,
    emergencyContactPhone: input.emergencyContactPhone ?? current.emergency_contact_phone,
  });
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : current.email;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Enter a valid client email.');
  }
  if (!current.clerk_user_id.startsWith('manual:') && email !== current.email) {
    throw new Error('Signed-in client email is managed through Clerk.');
  }

  const updated = await serviceClient()
    .from('app_users')
    .update({
      email,
      full_name: normalized.fullName,
      phone: normalized.phone,
      profile_goal: normalized.profileGoal,
      emergency_contact_name: normalized.emergencyContactName,
      emergency_contact_phone: normalized.emergencyContactPhone,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clientId)
    .select(APP_USER_SELECT)
    .single();

  if (updated.error) throw updated.error;
  return { client: toAdminClientSummary(updated.data as AppUserRow, []) };
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

function normalizeAdminBookingInput(input: CreateAdminBookingInput): {
  clientId: string | null;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  serviceType: BookingServiceType;
  startsAt: Date;
  durationMinutes: number;
} {
  const clientId = typeof input.clientId === 'string' && UUID_RE.test(input.clientId) ? input.clientId : null;
  const clientName = normalizeProfileText(input.clientName) ?? '';
  const clientEmail = typeof input.clientEmail === 'string' ? input.clientEmail.trim().toLowerCase() : '';
  if (!clientId && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clientEmail)) {
    throw new Error('Choose a saved client or enter a client email.');
  }

  const startsAt = normalizeBookingDate(input.startsAt);
  if (!startsAt) throw new Error('Appointment date is invalid.');

  const durationMinutes = normalizeEditableDuration(input.durationMinutes, 60);

  return {
    clientId,
    clientName: clientName || clientEmail || 'StryvFit+ client',
    clientEmail,
    clientPhone: normalizeClientPhoneInput(input.clientPhone),
    serviceType: parseBookingService(input.serviceType),
    startsAt,
    durationMinutes,
  };
}

async function ensureAdminBookingClient(input: ReturnType<typeof normalizeAdminBookingInput>): Promise<AppUserRow | null> {
  const sb = serviceClient();
  if (input.clientId) {
    const existing = await sb.from('app_users').select(APP_USER_SELECT).eq('id', input.clientId).maybeSingle();
    if (existing.error) throw existing.error;
    if (!existing.data) throw new Error('Client not found');
    if (existing.data.role !== 'client') throw new Error('Only client profiles can be scheduled.');
    return existing.data as AppUserRow;
  }

  const existing = await sb.from('app_users').select(APP_USER_SELECT).eq('email', input.clientEmail).maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data) {
    if (existing.data.role !== 'client') throw new Error('That email belongs to a staff account.');
    return existing.data as AppUserRow;
  }

  const inserted = await sb
    .from('app_users')
    .insert({
      clerk_user_id: manualClerkUserId(),
      email: input.clientEmail,
      full_name: input.clientName,
      phone: input.clientPhone,
      role: 'client',
      profile_goal: 'Trainer-scheduled client',
    })
    .select(APP_USER_SELECT)
    .single();
  if (inserted.error) throw inserted.error;
  return inserted.data as AppUserRow;
}

async function deleteBookingRow(bookingId: string): Promise<void> {
  const { error } = await serviceClient().from('bookings').delete().eq('id', bookingId);
  if (error) throw error;
}

function calendarInputForBooking(booking: BookingRow): Parameters<typeof createCalendarEvent>[0] {
  const service = bookingServiceForType(booking.service_type);
  return {
    bookingId: booking.id,
    title: `StryvFit+: ${service.label}`,
    description: service.description,
    startsAt: booking.starts_at,
    endsAt: booking.ends_at,
    attendeeEmail: booking.client_email,
    attendeeName: booking.client_name,
  };
}

export async function createAdminBooking(
  input: CreateAdminBookingInput,
  admin?: Pick<AppUserRow, 'id' | 'email'>
): Promise<{ booking: AdminBookingSummary }> {
  const normalized = normalizeAdminBookingInput(input);
  const startsAt = normalized.startsAt;
  const endsAt = new Date(startsAt.getTime() + normalized.durationMinutes * 60_000);
  const availability = await assertSlotAvailable(startsAt.toISOString(), endsAt.toISOString());
  if (!availability.ok) throw new Error(availability.reason);

  const client = await ensureAdminBookingClient(normalized);
  const clientEmail = client?.email ?? normalized.clientEmail;
  const clientName = client?.full_name ?? normalized.clientName;
  const clientPhone = client?.phone ?? normalized.clientPhone;
  const inserted = await serviceClient()
    .from('bookings')
    .insert({
      app_user_id: client?.id ?? null,
      clerk_user_id: client?.clerk_user_id ?? null,
      service_type: normalized.serviceType,
      status: 'confirmed',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      duration_minutes: normalized.durationMinutes,
      timezone: process.env.BOOKING_TIMEZONE ?? 'America/New_York',
      client_email: clientEmail,
      client_name: clientName,
      client_phone: clientPhone,
      confirmed_at: new Date().toISOString(),
      metadata: {
        source: 'stryvadmin-manual-schedule',
        createdByUserId: admin?.id ?? null,
        createdByEmail: admin?.email ?? null,
      },
    })
    .select(BOOKING_SELECT)
    .single();

  if (inserted.error) throw inserted.error;
  const booking = inserted.data as BookingRow;
  const googleEventId = await createCalendarEvent(calendarInputForBooking(booking));
  if (!googleEventId) {
    await deleteBookingRow(booking.id);
    throw new Error('Google Calendar event could not be created. No appointment was saved.');
  }

  const updated = await serviceClient()
    .from('bookings')
    .update({
      google_event_id: googleEventId,
      google_calendar_id: process.env.GOOGLE_CALENDAR_ID ?? 'primary',
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id)
    .select(BOOKING_SELECT)
    .single();

  if (updated.error) throw updated.error;
  return { booking: toAdminBookingSummary(updated.data as BookingRow) };
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

  if (row.google_event_id) {
    const result = await deleteCalendarEvent(row.google_event_id);
    if (!result.ok) throw new Error(result.reason);
    calendarDeleted = true;
  }

  await markBookingCancelled(row.id);

  return {
    booking: toAdminBookingSummary({ ...row, status: 'cancelled' }),
    calendarDeleted,
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
): Promise<{ booking: AdminBookingSummary; calendarUpdated: boolean; calendarDeleted: boolean }> {
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
  const nextBooking: BookingRow = {
    ...row,
    client_name: updates.client_name,
    client_email: updates.client_email,
    client_phone: updates.client_phone,
    service_type: updates.service_type,
    status: updates.status,
    starts_at: updates.starts_at,
    ends_at: updates.ends_at,
    duration_minutes: updates.duration_minutes,
  };
  let calendarUpdated = false;
  let calendarDeleted = false;

  if (row.google_event_id) {
    if (updates.status === 'cancelled' || updates.status === 'expired') {
      const result = await deleteCalendarEvent(row.google_event_id);
      if (!result.ok) throw new Error(result.reason);
      calendarDeleted = true;
    } else {
      const result = await updateCalendarEvent(row.google_event_id, calendarInputForBooking(nextBooking));
      if (!result.ok) throw new Error(result.reason);
      calendarUpdated = true;
    }
  }

  const updated = await serviceClient()
    .from('bookings')
    .update(updates)
    .eq('id', bookingId)
    .select(BOOKING_SELECT)
    .single();

  if (updated.error) throw updated.error;

  return {
    booking: toAdminBookingSummary(updated.data as BookingRow),
    calendarUpdated,
    calendarDeleted,
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
  const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
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

function checkoutSessionIsPaid(session: Stripe.Checkout.Session): boolean {
  return session.status === 'complete' && ['paid', 'no_payment_required'].includes(session.payment_status);
}

export async function confirmPaidBookingReturn(
  appUser: BookingOwner,
  sessionId: string
): Promise<{ status: 'confirmed' | 'calendar_pending' | 'pending' }> {
  if (!sessionId.startsWith('cs_')) return { status: 'pending' };

  const session = await stripe().checkout.sessions.retrieve(sessionId);
  const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
  if (!bookingId || !checkoutSessionIsPaid(session)) return { status: 'pending' };

  const existing = await serviceClient().from('bookings').select(BOOKING_SELECT).eq('id', bookingId).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data || !bookingBelongsToUser(existing.data as BookingRow, appUser)) {
    return { status: 'pending' };
  }

  const booking = await confirmBookingFromStripe(session);
  if (!booking) return { status: 'pending' };

  const googleEventId = await ensureGoogleEvent(booking);
  await sendBookingCompletionNotice(booking, {
    calendarStatus: googleEventId ? 'created' : 'pending',
  }).catch(() => null);
  return { status: googleEventId ? 'confirmed' : 'calendar_pending' };
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

  const service = bookingServiceForType(booking.service_type);
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
  return getStripePriceId(bookingServiceForType(serviceType));
}
