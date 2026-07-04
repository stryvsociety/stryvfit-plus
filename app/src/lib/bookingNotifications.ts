import { BOOKING_SERVICES } from '@/lib/bookingServices';
import { appUrl } from '@/lib/stripeClient';
import { serviceClient } from '@/lib/supabase';
import type { BookingCommunicationPreference, BookingRow } from '@/lib/bookings';

type BookingCompletionNoticeInput = {
  calendarStatus?: 'created' | 'pending';
};

export type BookingCompletionNoticeResult = {
  channel: BookingCommunicationPreference;
  emailStatus: string;
  textStatus: string;
};

type BookingCommunicationMetadata = {
  preferredChannel?: unknown;
  email?: unknown;
  phone?: unknown;
};

function metadataRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function communicationFromBooking(booking: BookingRow): {
  channel: BookingCommunicationPreference;
  email: string | null;
  phone: string | null;
} {
  const metadata = metadataRecord(booking.metadata);
  const communication = metadataRecord(metadata.communication) as BookingCommunicationMetadata;
  const channel = communication.preferredChannel === 'text' ? 'text' : 'email';
  const email = typeof communication.email === 'string' && communication.email ? communication.email : booking.client_email;
  const phone = typeof communication.phone === 'string' && communication.phone ? communication.phone : booking.client_phone;
  return { channel, email, phone };
}

function alreadyAttempted(booking: BookingRow): boolean {
  const notice = metadataRecord(metadataRecord(booking.metadata).completionNotice);
  return typeof notice.attemptedAt === 'string';
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replaceAll('"', '&quot;');
}

function formatBookingWindow(booking: BookingRow): string {
  const start = new Date(booking.starts_at);
  if (Number.isNaN(start.getTime())) return 'your selected time';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: process.env.BOOKING_TIMEZONE ?? 'America/New_York',
    timeZoneName: 'short',
  }).format(start);
}

function completionCopy(booking: BookingRow, calendarStatus: 'created' | 'pending') {
  const service = BOOKING_SERVICES[booking.service_type];
  const firstName = booking.client_name?.split(' ')[0] || 'there';
  const when = formatBookingWindow(booking);
  const calendarLine =
    calendarStatus === 'created'
      ? 'Your calendar invite is on the way.'
      : 'The team is finalizing your calendar invite.';
  return {
    subject: `StryvFit+ booking confirmed: ${service.label}`,
    text: [
      `Hi ${firstName},`,
      '',
      `Your ${service.label} is confirmed for ${when}.`,
      calendarLine,
      '',
      `Open your account: ${appUrl('/book')}`,
    ].join('\n'),
    html: `
      <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;line-height:1.5">
        <p>Hi ${escapeHtml(firstName)},</p>
        <p>Your <strong>${escapeHtml(service.label)}</strong> is confirmed for ${escapeHtml(when)}.</p>
        <p>${escapeHtml(calendarLine)}</p>
        <p style="margin-top:24px">
          <a href="${escapeAttribute(appUrl('/book'))}" style="display:inline-block;border-radius:8px;background:#f24f09;color:#111;padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none">Open StryvFit+</a>
        </p>
      </div>
    `,
    sms: `StryvFit+: your ${service.label} is confirmed for ${when}. ${calendarLine}`,
  };
}

async function sendCompletionEmail(booking: BookingRow, email: string, calendarStatus: 'created' | 'pending'): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BOOKING_NOTICE_FROM_EMAIL ?? process.env.BILLING_NOTICE_FROM_EMAIL;
  if (!apiKey || !from) return 'skipped_missing_email_provider';

  const copy = completionCopy(booking, calendarStatus);
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
      'Idempotency-Key': `booking-completion-${booking.id}`,
    },
    body: JSON.stringify({
      from,
      to: [email],
      reply_to: process.env.BOOKING_NOTICE_REPLY_TO ?? process.env.BILLING_NOTICE_REPLY_TO ?? 'ashley@stryvsocietyfit.com',
      subject: copy.subject,
      text: copy.text,
      html: copy.html,
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(`Booking email failed: ${res.status} ${message}`.trim());
  }

  return 'sent';
}

async function sendCompletionText(booking: BookingRow, phone: string, calendarStatus: 'created' | 'pending'): Promise<string> {
  const webhookUrl = process.env.BOOKING_TEXT_WEBHOOK_URL;
  if (!webhookUrl) return 'skipped_missing_text_provider';

  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (process.env.BOOKING_TEXT_WEBHOOK_SECRET) {
    headers.authorization = `Bearer ${process.env.BOOKING_TEXT_WEBHOOK_SECRET}`;
  }

  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      bookingId: booking.id,
      idempotencyKey: `booking-completion-${booking.id}`,
      to: phone,
      body: completionCopy(booking, calendarStatus).sms,
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(`Booking text failed: ${res.status} ${message}`.trim());
  }

  return 'sent';
}

async function markNoticeAttempted(
  booking: BookingRow,
  result: BookingCompletionNoticeResult,
  calendarStatus: 'created' | 'pending'
): Promise<void> {
  const metadata = metadataRecord(booking.metadata);
  const { error } = await serviceClient()
    .from('bookings')
    .update({
      metadata: {
        ...metadata,
        completionNotice: {
          attemptedAt: new Date().toISOString(),
          preferredChannel: result.channel,
          calendarStatus,
          emailStatus: result.emailStatus.slice(0, 500),
          textStatus: result.textStatus.slice(0, 500),
        },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id);

  if (error) throw error;
}

export async function sendBookingCompletionNotice(
  booking: BookingRow,
  input: BookingCompletionNoticeInput = {}
): Promise<BookingCompletionNoticeResult> {
  const calendarStatus = input.calendarStatus ?? (booking.google_event_id ? 'created' : 'pending');
  const communication = communicationFromBooking(booking);
  const result: BookingCompletionNoticeResult = {
    channel: communication.channel,
    emailStatus: 'skipped',
    textStatus: 'skipped',
  };

  if (alreadyAttempted(booking)) {
    return { ...result, emailStatus: 'skipped_duplicate', textStatus: 'skipped_duplicate' };
  }

  try {
    if (communication.channel === 'text' && communication.phone) {
      result.textStatus = await sendCompletionText(booking, communication.phone, calendarStatus);
    }
  } catch (error) {
    result.textStatus = error instanceof Error ? `failed:${error.message}` : 'failed';
  }

  try {
    const shouldSendEmail =
      communication.channel === 'email' ||
      result.textStatus === 'skipped_missing_text_provider' ||
      result.textStatus.startsWith('failed:');
    if (shouldSendEmail && communication.email) {
      result.emailStatus = await sendCompletionEmail(booking, communication.email, calendarStatus);
    }
  } catch (error) {
    result.emailStatus = error instanceof Error ? `failed:${error.message}` : 'failed';
  }

  await markNoticeAttempted(booking, result, calendarStatus);
  return result;
}
