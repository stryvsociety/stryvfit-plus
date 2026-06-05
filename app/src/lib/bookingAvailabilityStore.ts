import {
  DEFAULT_BOOKING_AVAILABILITY,
  type BookingAvailability,
  bookingTimezone,
  combineBookingTzDateAndTime,
  formatCalendarDateKey,
  parseBookingAvailability,
} from '@/lib/bookingAvailability';
import { serviceClient } from '@/lib/supabase';

export { bookingTimezone, combineBookingTzDateAndTime, formatCalendarDateKey, parseBookingAvailability };

export async function getBookingAvailability(): Promise<BookingAvailability> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('app_settings')
    .select('booking_availability')
    .eq('id', 1)
    .maybeSingle();

  if (error) {
    // Column not migrated yet — fall back so bookings still work with defaults.
    if (error.code === '42703' || error.code === 'PGRST204') {
      return DEFAULT_BOOKING_AVAILABILITY;
    }
    throw error;
  }
  return parseBookingAvailability(data?.booking_availability);
}

export async function saveBookingAvailability(availability: BookingAvailability): Promise<BookingAvailability> {
  const sb = serviceClient();
  const { data, error } = await sb
    .from('app_settings')
    .update({
      booking_availability: availability,
      updated_at: new Date().toISOString(),
    })
    .eq('id', 1)
    .select('booking_availability')
    .single();

  if (error) throw error;
  return parseBookingAvailability(data.booking_availability);
}

/** Wall-clock date (YYYY-MM-DD) and HH:mm in the business timezone. */
export function slotPartsInBookingTz(iso: string): { dateKey: string; time: string } {
  const tz = bookingTimezone();
  const date = new Date(iso);
  const dateKey = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(date);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find((p) => p.type === 'hour')?.value ?? '00';
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00';
  return { dateKey, time: `${hour}:${minute}` };
}
