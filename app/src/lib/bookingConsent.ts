export const BOOKING_CONSENT_FORM_URL =
  process.env.NEXT_PUBLIC_BOOKING_CONSENT_FORM_URL ??
  'https://docs.google.com/forms/d/e/1FAIpQLScNORWq7FyZFFnpg94m4Pdsm3xIfT7i8v3RDOtsuvzyif_F1A/viewform?pli=1';

export function bookingRequiresConsent(_serviceType: string): boolean {
  return true;
}
