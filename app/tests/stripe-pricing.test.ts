import { describe, expect, test } from 'bun:test';
import { formatStripePrice, stripeLookupKeyForService } from '../src/lib/stripePricing';

describe('Stripe website pricing contract', () => {
  test('uses the stable Stripe lookup key for every website plan', () => {
    expect(stripeLookupKeyForService('sessions_8')).toBe('stryv_sessions_8');
    expect(stripeLookupKeyForService('online_coaching_elite')).toBe('stryv_online_coaching_elite');
  });

  test('formats one-time Stripe prices without inventing a billing period', () => {
    expect(formatStripePrice({ currency: 'usd', unit_amount: 20000, recurring: null })).toEqual({
      amount: '$200',
      period: '',
    });
  });

  test('formats recurring Stripe prices from the Stripe interval', () => {
    expect(
      formatStripePrice({
        currency: 'usd',
        unit_amount: 18000,
        recurring: { interval: 'month', interval_count: 1 },
      })
    ).toEqual({ amount: '$180', period: '/ month' });
  });
});
