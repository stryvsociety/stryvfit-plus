export type ClientLifecycle = 'new' | 'first_session_booked' | 'returning' | 'existing';

export type ClientLifecycleBooking = {
  service_type?: string | null;
  serviceType?: string | null;
  status?: string | null;
  starts_at?: string | null;
  startsAt?: string | null;
};

export const FIRST_SESSION_OFFER_CONSUMING_STATUSES = [
  'held',
  'pending_payment',
  'confirmed',
  'rescheduled',
  'completed',
  'no_show',
] as const;

const ACTIVE_FIRST_SESSION_STATUSES = new Set(['held', 'pending_payment', 'confirmed', 'rescheduled']);
const RETURNING_FIRST_SESSION_STATUSES = new Set(['completed', 'no_show']);
const CONSUMING_STATUS_SET = new Set<string>(FIRST_SESSION_OFFER_CONSUMING_STATUSES);

function bookingServiceType(booking: ClientLifecycleBooking): string | null {
  return booking.service_type ?? booking.serviceType ?? null;
}

function bookingStatus(booking: ClientLifecycleBooking): string | null {
  return booking.status ?? null;
}

export function bookingConsumesFirstSessionOffer(booking: ClientLifecycleBooking): boolean {
  return bookingServiceType(booking) === 'free' && CONSUMING_STATUS_SET.has(bookingStatus(booking) ?? '');
}

export function clientLifecycleFromHistory(input: {
  manual?: boolean;
  hasSubscription?: boolean;
  bookings?: ClientLifecycleBooking[];
}): ClientLifecycle {
  if (input.manual) return 'existing';
  if (input.hasSubscription) return 'returning';

  const bookings = input.bookings ?? [];
  const consumableFirstSessions = bookings.filter(bookingConsumesFirstSessionOffer);
  if (consumableFirstSessions.some((booking) => RETURNING_FIRST_SESSION_STATUSES.has(bookingStatus(booking) ?? ''))) {
    return 'returning';
  }

  const hasPaidOrNonIntroHistory = bookings.some((booking) => {
    const status = bookingStatus(booking);
    return (
      bookingServiceType(booking) !== 'free' &&
      Boolean(status) &&
      status !== 'cancelled' &&
      status !== 'expired'
    );
  });
  if (hasPaidOrNonIntroHistory) return 'returning';

  if (consumableFirstSessions.some((booking) => ACTIVE_FIRST_SESSION_STATUSES.has(bookingStatus(booking) ?? ''))) {
    return 'first_session_booked';
  }

  return 'new';
}

export function clientLifecycleLabel(lifecycle: ClientLifecycle): string {
  if (lifecycle === 'first_session_booked') return 'First booked';
  return lifecycle[0].toUpperCase() + lifecycle.slice(1);
}
