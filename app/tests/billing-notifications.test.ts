import { describe, expect, test } from 'bun:test';
import { billingNoticeReasonForSubscription } from '@/lib/billingNotifications';

describe('billing recovery notifications', () => {
  test('maps Stripe subscription recovery states to client notices', () => {
    expect(billingNoticeReasonForSubscription('past_due')).toBe('subscription_past_due');
    expect(billingNoticeReasonForSubscription('unpaid')).toBe('subscription_unpaid');
    expect(billingNoticeReasonForSubscription('canceled')).toBe('subscription_canceled');
    expect(billingNoticeReasonForSubscription('incomplete_expired')).toBe('subscription_incomplete_expired');
  });

  test('ignores healthy subscription states', () => {
    expect(billingNoticeReasonForSubscription('active')).toBeNull();
    expect(billingNoticeReasonForSubscription('trialing')).toBeNull();
    expect(billingNoticeReasonForSubscription(null)).toBeNull();
  });
});
