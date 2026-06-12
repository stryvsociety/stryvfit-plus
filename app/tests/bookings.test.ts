import { describe, expect, test } from 'bun:test';
import { BOOKING_CONSENT_FORM_URL } from '../src/lib/bookingConsent';
import { buildAvailableTimes, buildAvailableTimesForDate, parseBookingAvailability } from '../src/lib/bookingAvailability';
import {
  adminBookingClientName,
  adminClientSummariesFromBookings,
  buildBookingMetadata,
  mergeAdminClientSummaries,
  type AdminBookingSummary,
  manualClerkUserId,
  normalizeAdminClientInput,
  normalizeAdminClientLimit,
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

  test('caps admin client roster limits for API reads', () => {
    expect(normalizeAdminClientLimit('15')).toBe(15);
    expect(normalizeAdminClientLimit('0')).toBe(1);
    expect(normalizeAdminClientLimit('999')).toBe(200);
    expect(normalizeAdminClientLimit('not-a-number')).toBe(80);
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

  test('adds booked clients to the admin CRM roster once they have appointment history', () => {
    const bookingClients = adminClientSummariesFromBookings([
      {
        id: 'booked-once',
        serviceType: 'free',
        serviceLabel: 'Free first session',
        status: 'confirmed',
        startsAt: '2026-06-12T13:00:00.000Z',
        endsAt: '2026-06-12T14:00:00.000Z',
        durationMinutes: 60,
        clientName: 'Dangel Smith',
        clientEmail: 'dangel@example.com',
        clientPhone: '+13055550198',
        googleEventId: null,
      },
    ]);

    expect(bookingClients).toMatchObject([
      {
        id: 'booking:booked-once',
        name: 'Dangel Smith',
        email: 'dangel@example.com',
        phone: '+13055550198',
        status: 'Booked appointment',
      },
    ]);

    const merged = mergeAdminClientSummaries(
      [
        {
          id: 'profile-client',
          name: 'Dangel Smith',
          email: 'dangel@example.com',
          phone: null,
          status: 'Client account',
          goal: 'Client profile',
          payment: 'No billing yet',
        },
      ],
      bookingClients
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('profile-client');
  });

  test('links StryvFit+ subscription session imports to saved client profiles by name', () => {
    const subscriptionBooking: AdminBookingSummary = {
      id: 'calendar:nyce-subscription',
      source: 'google_calendar',
      serviceType: 'coaching',
      serviceLabel: 'StryvFit+ session for Nyce Reynolds',
      status: 'confirmed',
      startsAt: '2026-06-12T13:00:00.000Z',
      endsAt: '2026-06-12T14:00:00.000Z',
      durationMinutes: 60,
      clientName: 'StryvFit+ session for Nyce Reynolds',
      clientEmail: null,
      clientPhone: null,
      googleEventId: 'external-nyce-event',
    };

    expect(adminBookingClientName(subscriptionBooking)).toBe('Nyce Reynolds');

    const bookingClients = adminClientSummariesFromBookings([subscriptionBooking]);
    expect(bookingClients).toMatchObject([
      {
        id: 'booking:calendar:nyce-subscription',
        name: 'Nyce Reynolds',
        email: null,
        status: 'Booked appointment',
      },
    ]);

    const merged = mergeAdminClientSummaries(
      [
        {
          id: 'profile-nyce',
          name: 'Nyce Reynolds',
          email: 'blackrockstarmg@gmail.com',
          phone: null,
          status: 'Client account',
          goal: 'Client profile',
          payment: 'No billing yet',
        },
      ],
      bookingClients
    );

    expect(merged).toHaveLength(1);
    expect(merged[0].id).toBe('profile-nyce');
    expect(merged[0].name).toBe('Nyce Reynolds');
  });
});
