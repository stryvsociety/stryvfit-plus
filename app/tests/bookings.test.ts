import { describe, expect, test } from 'bun:test';
import { BOOKING_CONSENT_FORM_URL } from '../src/lib/bookingConsent';
import { buildAvailableTimes, buildAvailableTimesForDate, parseBookingAvailability } from '../src/lib/bookingAvailability';
import {
  buildBookingMetadata,
  type AdminBookingSummary,
  manualClerkUserId,
  normalizeAdminClientInput,
  normalizeClientPhoneInput,
} from '../src/lib/bookings';

describe('booking utilities', () => {
  test('records consent metadata for session bookings', () => {
    const metadata = buildBookingMetadata({
      serviceType: 'free',
      consentAcknowledged: true,
      consentAcknowledgedAt: '2026-06-01T19:30:00.000Z',
    });

    expect(metadata).toMatchObject({
      source: 'stryvfit-booking-flow',
      consent: {
        required: true,
        acknowledged: true,
        formUrl: BOOKING_CONSENT_FORM_URL,
        acknowledgedAt: '2026-06-01T19:30:00.000Z',
      },
    });
  });

  test('does not require consent metadata for meal prep bookings', () => {
    const metadata = buildBookingMetadata({
      serviceType: 'meal_prep',
      consentAcknowledged: false,
    });

    expect(metadata).toEqual({ source: 'stryvfit-booking-flow' });
  });

  test('keeps exact trainer starts instead of stepping by duration plus buffer', () => {
    const availability = parseBookingAvailability({
      firstStart: '06:30',
      lastStart: '08:30',
      bufferMinutes: 30,
      startTimes: ['08:30', '07:30', '06:30', '07:30'],
      blockedSlots: {},
    });

    expect(buildAvailableTimes(availability, 60)).toEqual(['06:30', '07:30', '08:30']);
  });

  test('uses repeating weekday starts for the selected booking day', () => {
    const availability = parseBookingAvailability({
      firstStart: '06:30',
      lastStart: '08:30',
      bufferMinutes: 30,
      startTimes: ['06:30'],
      weeklyStartTimes: { '5': ['08:30', '07:30'] },
      blockedSlots: {},
    });

    expect(buildAvailableTimesForDate(availability, 60, '2026-06-12')).toEqual(['07:30', '08:30']);
    expect(buildAvailableTimesForDate(availability, 60, '2026-06-13')).toEqual(['06:30']);
  });

  test('normalizes manual admin clients by email', () => {
    expect(normalizeAdminClientInput({ fullName: ' Nia McCain ', email: ' NIA@EXAMPLE.COM ' })).toEqual({
      fullName: 'Nia McCain',
      email: 'nia@example.com',
      phone: null,
      existingClient: true,
    });
  });

  test('normalizes client mobile numbers for admin and booking flows', () => {
    expect(normalizeClientPhoneInput('(305) 555-0198')).toBe('+13055550198');
    expect(normalizeAdminClientInput({ email: 'nia@example.com', phone: '+1 305 555 0198' }).phone).toBe(
      '+13055550198'
    );
  });

  test('marks placeholder Clerk IDs as manual clients', () => {
    expect(manualClerkUserId('existing-client')).toBe('manual:existing-client');
  });

  test('can represent imported Google Calendar appointments without a local booking id', () => {
    const booking: AdminBookingSummary = {
      id: 'calendar:external-event',
      source: 'google_calendar',
      serviceType: 'free',
      serviceLabel: 'Google Calendar event',
      status: 'confirmed',
      startsAt: '2026-06-12T13:00:00.000Z',
      endsAt: '2026-06-12T14:00:00.000Z',
      durationMinutes: 60,
      clientName: 'Nia McCain',
      clientEmail: 'nia@example.com',
      clientPhone: null,
      googleEventId: 'external-event',
    };

    expect(booking.id).toBe('calendar:external-event');
    expect(booking.source).toBe('google_calendar');
  });
});
