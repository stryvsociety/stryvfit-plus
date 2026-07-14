export type BookingServiceType =
  | 'free'
  | 'sessions_4'
  | 'sessions_8'
  | 'sessions_12'
  | 'online_coaching_starter'
  | 'online_coaching_elevate'
  | 'online_coaching_elite';

export type BookingPaymentMode = 'free' | 'payment' | 'subscription';

export const MEMBERSHIP_INVOICE_SERVICE_TYPES = ['sessions_4', 'sessions_8', 'sessions_12'] as const;
export type MembershipInvoiceServiceType = (typeof MEMBERSHIP_INVOICE_SERVICE_TYPES)[number];

export type BookingService = {
  type: BookingServiceType;
  label: string;
  description: string;
  stripePriceEnv?: string;
  paymentMode: BookingPaymentMode;
};

export const BOOKING_SERVICES: Record<BookingServiceType, BookingService> = {
  free: {
    type: 'free',
    label: 'Free first session',
    description: 'First-session assessment with Stryv Society Fitness.',
    paymentMode: 'free',
  },
  sessions_4: {
    type: 'sessions_4',
    label: '4 in-person sessions',
    description: 'Two-week Stryv Society Fitness training block with four in-person sessions.',
    stripePriceEnv: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4',
    paymentMode: 'payment',
  },
  sessions_8: {
    type: 'sessions_8',
    label: '8 sessions per month',
    description: 'Monthly Stryv Society Fitness training rhythm with eight in-person sessions.',
    stripePriceEnv: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_8',
    paymentMode: 'payment',
  },
  sessions_12: {
    type: 'sessions_12',
    label: '12 sessions per month',
    description: 'High-touch monthly Stryv Society Fitness package with twelve in-person sessions.',
    stripePriceEnv: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_12',
    paymentMode: 'payment',
  },
  online_coaching_starter: {
    type: 'online_coaching_starter',
    label: 'Starter online coaching',
    description: 'Monthly online coaching with four sessions, weekly programming, check-ins, and form review.',
    stripePriceEnv: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_STARTER',
    paymentMode: 'subscription',
  },
  online_coaching_elevate: {
    type: 'online_coaching_elevate',
    label: 'Elevate online coaching',
    description: 'Monthly online coaching with eight sessions, progressive programming, priority messaging, and feedback.',
    stripePriceEnv: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELEVATE',
    paymentMode: 'subscription',
  },
  online_coaching_elite: {
    type: 'online_coaching_elite',
    label: 'Elite execution online coaching',
    description: 'Monthly online coaching with twelve sessions, advanced progression tracking, priority support, and goal tracking.',
    stripePriceEnv: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELITE',
    paymentMode: 'subscription',
  },
};

export function parseBookingService(value: unknown): BookingServiceType {
  if (value === 'coaching') return 'sessions_4';
  if (value === 'premium') return 'sessions_8';
  if (value === 'online_coaching') return 'online_coaching_starter';
  if (
    value === 'sessions_4' ||
    value === 'sessions_8' ||
    value === 'sessions_12' ||
    value === 'online_coaching_starter' ||
    value === 'online_coaching_elevate' ||
    value === 'online_coaching_elite'
  ) {
    return value;
  }
  return 'free';
}

export function getStripePriceId(service: BookingService): string | null {
  if (!service.stripePriceEnv) return null;
  return process.env[service.stripePriceEnv] ?? null;
}

export function parseMembershipInvoiceService(value: unknown): MembershipInvoiceServiceType | null {
  return typeof value === 'string' && MEMBERSHIP_INVOICE_SERVICE_TYPES.includes(value as MembershipInvoiceServiceType)
    ? (value as MembershipInvoiceServiceType)
    : null;
}
