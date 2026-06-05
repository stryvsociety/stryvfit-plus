import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function stripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  stripeClient ??= new Stripe(secretKey, {
    apiVersion: '2026-05-27.dahlia',
    typescript: true,
  });
  return stripeClient;
}

export function appUrl(path = ''): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return `${origin.replace(/\/$/, '')}${path}`;
}
