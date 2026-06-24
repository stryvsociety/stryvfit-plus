import { captureServerIncident } from '@/lib/serverIncidents';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';

export type GoogleBusyWindow = {
  start: string;
  end: string;
};

export type GoogleCalendarImportedEvent = {
  eventId: string;
  appBookingId: string | null;
  summary: string;
  startsAt: string;
  endsAt: string;
  attendeeEmail: string | null;
  attendeeName: string | null;
};

export type GoogleCalendarDeleteResult =
  | { ok: true; missing?: boolean }
  | { ok: false; reason: string };

export type CalendarEventInput = {
  bookingId: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
};

type GoogleCalendarEventResource = {
  id?: string;
  status?: string;
  summary?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean; organizer?: boolean }>;
  extendedProperties?: { private?: Record<string, string | undefined> };
};

function googleCalendarId(): string {
  return process.env.GOOGLE_CALENDAR_ID ?? 'primary';
}

function hasGoogleConfig(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN);
}

async function reportGoogleCalendarIncident(input: {
  route: string;
  message: string;
  context?: Record<string, unknown>;
  adminAction: string;
}) {
  try {
    await captureServerIncident({
      source: 'google-calendar',
      route: input.route,
      severity: 'high',
      message: input.message,
      context: input.context,
      admin_action: input.adminAction,
    });
  } catch {
    // Calendar failures should never make booking/support incident capture worse for the client.
  }
}

async function getGoogleAccessToken(): Promise<string | null> {
  if (!hasGoogleConfig()) return null;

  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: process.env.GOOGLE_REFRESH_TOKEN!,
    grant_type: 'refresh_token',
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: params,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google token refresh failed: ${res.status} ${text.slice(0, 240)}`);
  }

  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

function clientFromCalendarEvent(event: GoogleCalendarEventResource): {
  email: string | null;
  name: string | null;
} {
  const attendee = event.attendees?.find((item) => item.email && !item.self && !item.organizer);
  return {
    email: attendee?.email ?? null,
    name: attendee?.displayName ?? attendee?.email ?? null,
  };
}

export async function listUpcomingCalendarEvents(limit = 20): Promise<GoogleCalendarImportedEvent[]> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return [];

    const calendarId = googleCalendarId();
    const params = new URLSearchParams({
      singleEvents: 'true',
      orderBy: 'startTime',
      timeMin: new Date().toISOString(),
      maxResults: String(limit),
      timeZone: process.env.BOOKING_TIMEZONE ?? 'America/New_York',
    });
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!res.ok) {
      const text = await res.text();
      await reportGoogleCalendarIncident({
        route: '/admin/pulse',
        message: `Google Calendar event import failed: ${res.status}`,
        context: { response: text.slice(0, 500) },
        adminAction: 'Check Google OAuth refresh token and Calendar API permissions.',
      });
      return [];
    }

    const json = (await res.json()) as { items?: GoogleCalendarEventResource[] };
    return (json.items ?? [])
      .filter((event) => event.status !== 'cancelled' && event.id && event.start?.dateTime && event.end?.dateTime)
      .map((event) => {
        const client = clientFromCalendarEvent(event);
        return {
          eventId: event.id!,
          appBookingId: event.extendedProperties?.private?.stryvfit_booking_id ?? null,
          summary: event.summary?.trim() || 'Google Calendar event',
          startsAt: event.start!.dateTime!,
          endsAt: event.end!.dateTime!,
          attendeeEmail: client.email,
          attendeeName: client.name,
        };
      });
  } catch (error) {
    await reportGoogleCalendarIncident({
      route: '/admin/pulse',
      message: error instanceof Error ? error.message : 'Google Calendar event import failed',
      adminAction: 'Refresh Google Calendar credentials so external appointments can appear in StryvAdmin.',
    });
    return [];
  }
}

export async function listBusyWindows(startsAt: string, endsAt: string): Promise<GoogleBusyWindow[]> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return [];

    const calendarId = googleCalendarId();
    const res = await fetch(`${GOOGLE_CALENDAR_API}/freeBusy`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${accessToken}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: startsAt,
        timeMax: endsAt,
        timeZone: process.env.BOOKING_TIMEZONE ?? 'America/New_York',
        items: [{ id: calendarId }],
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      await reportGoogleCalendarIncident({
        route: '/api/bookings/availability',
        message: `Google freeBusy failed: ${res.status}`,
        context: { startsAt, endsAt, response: text.slice(0, 500) },
        adminAction: 'Check Google OAuth refresh token and Calendar API permissions.',
      });
      return [];
    }

    const json = (await res.json()) as {
      calendars?: Record<string, { busy?: GoogleBusyWindow[] }>;
    };
    return json.calendars?.[calendarId]?.busy ?? [];
  } catch (error) {
    await reportGoogleCalendarIncident({
      route: '/api/bookings/availability',
      message: error instanceof Error ? error.message : 'Google freeBusy failed',
      context: { startsAt, endsAt },
      adminAction: 'Refresh Google Calendar credentials; booking availability is temporarily using internal holds only.',
    });
    return [];
  }
}

export async function createCalendarEvent(input: CalendarEventInput): Promise<string | null> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return null;

    const calendarId = googleCalendarId();
    const event = {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startsAt, timeZone: process.env.BOOKING_TIMEZONE ?? 'America/New_York' },
      end: { dateTime: input.endsAt, timeZone: process.env.BOOKING_TIMEZONE ?? 'America/New_York' },
      attendees: input.attendeeEmail
        ? [{ email: input.attendeeEmail, displayName: input.attendeeName ?? undefined }]
        : undefined,
      extendedProperties: {
        private: {
          stryvfit_booking_id: input.bookingId,
        },
      },
    };

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!res.ok) {
      const text = await res.text();
      await reportGoogleCalendarIncident({
        route: '/api/bookings/checkout',
        message: `Google Calendar event creation failed: ${res.status}`,
        context: { bookingId: input.bookingId, response: text.slice(0, 500) },
        adminAction: 'Check Google OAuth refresh token and Calendar API permissions.',
      });
      return null;
    }

    const json = (await res.json()) as { id?: string };
    return json.id ?? null;
  } catch (error) {
    await reportGoogleCalendarIncident({
      route: '/api/bookings/checkout',
      message: error instanceof Error ? error.message : 'Google Calendar event creation failed',
      context: { bookingId: input.bookingId },
      adminAction: 'Refresh Google Calendar credentials and manually confirm the booked session if needed.',
    });
    return null;
  }
}

export async function updateCalendarEvent(
  eventId: string,
  input: CalendarEventInput
): Promise<GoogleCalendarDeleteResult> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      await reportGoogleCalendarIncident({
        route: '/api/admin/bookings/[id]',
        message: 'Google Calendar event update skipped: missing Google OAuth configuration',
        context: { eventId, bookingId: input.bookingId },
        adminAction: 'Refresh Google Calendar credentials; the Solvys booking was not updated.',
      });
      return { ok: false, reason: 'Google Calendar credentials are missing.' };
    }

    const calendarId = googleCalendarId();
    const event = {
      summary: input.title,
      description: input.description,
      start: { dateTime: input.startsAt, timeZone: process.env.BOOKING_TIMEZONE ?? 'America/New_York' },
      end: { dateTime: input.endsAt, timeZone: process.env.BOOKING_TIMEZONE ?? 'America/New_York' },
      attendees: input.attendeeEmail
        ? [{ email: input.attendeeEmail, displayName: input.attendeeName ?? undefined }]
        : undefined,
      extendedProperties: {
        private: {
          stryvfit_booking_id: input.bookingId,
        },
      },
    };

    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'PATCH',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (res.status === 404 || res.status === 410) return { ok: false, reason: 'Google Calendar event is missing.' };
    if (res.ok) return { ok: true };

    const text = await res.text();
    await reportGoogleCalendarIncident({
      route: '/api/admin/bookings/[id]',
      message: `Google Calendar event update failed: ${res.status}`,
      context: { eventId, bookingId: input.bookingId, response: text.slice(0, 500) },
      adminAction: 'Check Google OAuth permissions; the Solvys booking was not updated.',
    });
    return { ok: false, reason: `Google Calendar update failed with ${res.status}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Calendar event update failed';
    await reportGoogleCalendarIncident({
      route: '/api/admin/bookings/[id]',
      message,
      context: { eventId, bookingId: input.bookingId },
      adminAction: 'Check Google OAuth permissions; the Solvys booking was not updated.',
    });
    return { ok: false, reason: message };
  }
}

export async function calendarEventExists(eventId: string): Promise<boolean | null> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) return null;

    const calendarId = googleCalendarId();
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (res.status === 404 || res.status === 410) return false;

    if (!res.ok) {
      const text = await res.text();
      await reportGoogleCalendarIncident({
        route: '/admin/pulse',
        message: `Google Calendar event lookup failed: ${res.status}`,
        context: { eventId, response: text.slice(0, 500) },
        adminAction: 'Check Google OAuth refresh token and Calendar API permissions.',
      });
      return null;
    }

    const json = (await res.json()) as { status?: string };
    return json.status !== 'cancelled';
  } catch (error) {
    await reportGoogleCalendarIncident({
      route: '/admin/pulse',
      message: error instanceof Error ? error.message : 'Google Calendar event lookup failed',
      context: { eventId },
      adminAction: 'Refresh Google Calendar credentials so deleted Google events reconcile back into Solvys.',
    });
    return null;
  }
}

export async function deleteCalendarEvent(eventId: string): Promise<GoogleCalendarDeleteResult> {
  try {
    const accessToken = await getGoogleAccessToken();
    if (!accessToken) {
      await reportGoogleCalendarIncident({
        route: '/api/admin/bookings/[id]',
        message: 'Google Calendar event deletion skipped: missing Google OAuth configuration',
        context: { eventId },
        adminAction: 'Refresh Google Calendar credentials; the Solvys booking was not cancelled locally.',
      });
      return { ok: false, reason: 'Google Calendar credentials are missing.' };
    }

    const calendarId = googleCalendarId();
    const res = await fetch(
      `${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}?sendUpdates=all`,
      {
        method: 'DELETE',
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (res.status === 404 || res.status === 410) return { ok: true, missing: true };
    if (res.ok) return { ok: true };

    const text = await res.text();
    await reportGoogleCalendarIncident({
      route: '/api/admin/bookings/[id]',
      message: `Google Calendar event deletion failed: ${res.status}`,
      context: { eventId, response: text.slice(0, 500) },
      adminAction: 'Check Google OAuth permissions; the Solvys booking was not cancelled locally.',
    });
    return { ok: false, reason: `Google Calendar delete failed with ${res.status}.` };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Google Calendar event deletion failed';
    await reportGoogleCalendarIncident({
      route: '/api/admin/bookings/[id]',
      message,
      context: { eventId },
      adminAction: 'Check Google OAuth permissions; the Solvys booking was not cancelled locally.',
    });
    return { ok: false, reason: message };
  }
}
