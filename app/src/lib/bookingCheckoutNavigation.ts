import type { BookingServiceType } from '@/lib/bookingServices';

export type BookingCheckoutNavigationDraft = {
  serviceType: BookingServiceType;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
  clientName?: string;
  clientPhone?: string;
  communicationPreference?: 'email' | 'text';
  consentAcknowledged?: boolean;
};

/**
 * Uses a document POST instead of fetch so mobile Safari can follow the server's
 * checkout redirect as a first-class navigation.
 */
export function submitBookingCheckoutNavigation(draft: BookingCheckoutNavigationDraft) {
  const form = document.createElement('form');
  form.method = 'post';
  form.action = '/api/bookings/checkout?transport=navigation';
  form.style.display = 'none';

  const fields: Record<string, string | number | undefined> = {
    serviceType: draft.serviceType,
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    durationMinutes: draft.durationMinutes,
    clientName: draft.clientName,
    clientPhone: draft.clientPhone,
    communicationPreference: draft.communicationPreference,
    consentAcknowledged: draft.consentAcknowledged ? 'true' : undefined,
  };

  for (const [name, value] of Object.entries(fields)) {
    if (value === undefined || value === '') continue;
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = String(value);
    form.appendChild(input);
  }

  document.body.appendChild(form);
  form.submit();
}
