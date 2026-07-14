import Stripe from 'stripe';

let stripeClient: Stripe | null = null;

export function stripe() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }

  stripeClient ??= new Stripe(secretKey, {
    apiVersion: '2026-05-27.dahlia',
    // OpenNext runs on Cloudflare Workers, where the native Fetch transport is
    // reliable and the Node HTTP transport can leave Stripe requests hanging.
    httpClient: Stripe.createFetchHttpClient(),
    maxNetworkRetries: 1,
    timeout: 20_000,
    typescript: true,
  });
  return stripeClient;
}

export function appUrl(path = ''): string {
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001';
  return `${origin.replace(/\/$/, '')}${path}`;
}
