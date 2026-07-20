import type Stripe from 'stripe';
import type { BookingServiceType } from '@/lib/bookingServices';
import { stripe } from '@/lib/stripeClient';

export const WEBSITE_PRICING_SERVICES = [
  'sessions_4',
  'sessions_8',
  'sessions_12',
  'online_coaching_starter',
  'online_coaching_elevate',
  'online_coaching_elite',
] as const satisfies readonly BookingServiceType[];

export type WebsitePricingService = (typeof WEBSITE_PRICING_SERVICES)[number];

export type LiveWebsitePrice = {
  amount: string;
  period: string;
};

export type LiveWebsitePrices = Partial<Record<WebsitePricingService, LiveWebsitePrice>>;

export function stripeLookupKeyForService(service: WebsitePricingService): string {
  return `stryv_${service}`;
}

export function formatStripePrice(price: Pick<Stripe.Price, 'currency' | 'unit_amount' | 'recurring'>): LiveWebsitePrice | null {
  if (price.unit_amount === null) return null;

  const amount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: price.currency.toUpperCase(),
    maximumFractionDigits: 0,
  }).format(price.unit_amount / 100);

  if (!price.recurring) return { amount, period: '' };

  const intervalCount = price.recurring.interval_count ?? 1;
  const interval = price.recurring.interval;
  const label = intervalCount === 1 ? interval : `${intervalCount} ${interval}s`;
  return { amount, period: `/ ${label}` };
}

async function activePricesByService(): Promise<Map<WebsitePricingService, Stripe.Price>> {
  const stripeClient = stripe();
  const lookupKeys = WEBSITE_PRICING_SERVICES.map(stripeLookupKeyForService);
  const result = await stripeClient.prices.list({ active: true, lookup_keys: lookupKeys, limit: lookupKeys.length });
  const prices = new Map<WebsitePricingService, Stripe.Price>();

  for (const price of result.data) {
    const service = WEBSITE_PRICING_SERVICES.find((candidate) => price.lookup_key === stripeLookupKeyForService(candidate));
    if (service && price.unit_amount !== null) prices.set(service, price);
  }

  await Promise.all(
    WEBSITE_PRICING_SERVICES.filter((service) => !prices.has(service)).map(async (service) => {
      const configuredPriceId = getStripePriceIdForService(service);
      if (!configuredPriceId) return;

      const configuredPrice = await stripeClient.prices.retrieve(configuredPriceId, { expand: ['product'] });
      const currentPrice = await currentProductPrice(stripeClient, configuredPrice);
      if (currentPrice?.active && currentPrice.unit_amount !== null) prices.set(service, currentPrice);
    })
  );

  return prices;
}

function getStripePriceIdForService(service: WebsitePricingService): string | null {
  const priceEnv = {
    sessions_4: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4',
    sessions_8: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_8',
    sessions_12: 'NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_12',
    online_coaching_starter: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_STARTER',
    online_coaching_elevate: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELEVATE',
    online_coaching_elite: 'NEXT_PUBLIC_STRIPE_PRICE_ONLINE_COACHING_ELITE',
  } satisfies Record<WebsitePricingService, string>;

  return process.env[priceEnv[service]] ?? null;
}

async function currentProductPrice(stripeClient: Stripe, configuredPrice: Stripe.Price): Promise<Stripe.Price | null> {
  let product = configuredPrice.product;
  if (typeof product === 'string') product = await stripeClient.products.retrieve(product);
  if ('deleted' in product && product.deleted) return configuredPrice;

  const defaultPrice = product.default_price;
  if (!defaultPrice) return configuredPrice;
  const price = typeof defaultPrice === 'string' ? await stripeClient.prices.retrieve(defaultPrice) : defaultPrice;
  return price.active ? price : configuredPrice;
}

export async function getLiveWebsitePrices(): Promise<LiveWebsitePrices> {
  const prices = await activePricesByService();
  const live: LiveWebsitePrices = {};

  for (const [service, price] of prices) {
    const formatted = formatStripePrice(price);
    if (formatted) live[service] = formatted;
  }

  return live;
}

export async function getLiveStripePriceId(service: WebsitePricingService): Promise<string | null> {
  const prices = await activePricesByService();
  return prices.get(service)?.id ?? null;
}
