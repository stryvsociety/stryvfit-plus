import Stripe from 'stripe';
import { appUrl } from '@/lib/stripeClient';
import { serviceClient } from '@/lib/supabase';
import { sendBillingPushNotice } from '@/lib/pwaPush';

export type BillingRecoveryReason =
  | 'payment_failed'
  | 'payment_action_required'
  | 'subscription_past_due'
  | 'subscription_unpaid'
  | 'subscription_canceled'
  | 'subscription_incomplete_expired';

type BillingNoticeTarget = {
  id: string;
  email: string;
  full_name: string | null;
};

type BillingRecoveryNoticeInput = {
  eventId?: string | null;
  reason: BillingRecoveryReason;
  customerId: string | null;
  subscriptionId?: string | null;
  invoice?: Stripe.Invoice | null;
};

function stripeCustomerId(value: Stripe.Invoice['customer'] | Stripe.Subscription['customer'] | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return 'deleted' in value && value.deleted ? null : value.id;
}

export function billingNoticeReasonForSubscription(status: string | null | undefined): BillingRecoveryReason | null {
  if (status === 'past_due') return 'subscription_past_due';
  if (status === 'unpaid') return 'subscription_unpaid';
  if (status === 'canceled') return 'subscription_canceled';
  if (status === 'incomplete_expired') return 'subscription_incomplete_expired';
  return null;
}

function reasonTitle(reason: BillingRecoveryReason): string {
  const titles: Record<BillingRecoveryReason, string> = {
    payment_failed: 'Payment needs attention',
    payment_action_required: 'Confirm your StryvFit+ payment',
    subscription_past_due: 'Subscription past due',
    subscription_unpaid: 'Subscription unpaid',
    subscription_canceled: 'Subscription canceled',
    subscription_incomplete_expired: 'Subscription expired',
  };
  return titles[reason];
}

function reasonBody(reason: BillingRecoveryReason): string {
  if (reason === 'payment_action_required') {
    return 'Stripe needs one more confirmation before your monthly coaching subscription can continue.';
  }
  if (reason === 'subscription_canceled') {
    return 'Your monthly coaching subscription is no longer active. Update billing or choose a new plan to keep booking.';
  }
  if (reason === 'subscription_incomplete_expired') {
    return 'Your monthly coaching subscription expired before billing was completed. Update billing or retry the payment to keep booking.';
  }
  return 'Your monthly coaching payment did not go through. Update billing or retry the payment to keep training on schedule.';
}

function amountLabel(invoice: Stripe.Invoice | null | undefined): string | null {
  if (!invoice?.amount_remaining || !invoice.currency) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: invoice.currency.toUpperCase(),
  }).format(invoice.amount_remaining / 100);
}

async function targetForBilling(input: BillingRecoveryNoticeInput): Promise<BillingNoticeTarget | null> {
  const filters: string[] = [];
  if (input.customerId) filters.push(`stripe_customer_id.eq.${input.customerId}`);
  if (input.subscriptionId) filters.push(`stripe_subscription_id.eq.${input.subscriptionId}`);
  if (filters.length === 0) return null;

  const { data, error } = await serviceClient()
    .from('app_users')
    .select('id, email, full_name')
    .or(filters.join(','))
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as BillingNoticeTarget | null) ?? null;
}

async function sendBillingEmail(target: BillingNoticeTarget, input: BillingRecoveryNoticeInput): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.BILLING_NOTICE_FROM_EMAIL;
  if (!apiKey || !from) return 'skipped_missing_email_provider';

  const updateUrl = appUrl('/book?billing=update');
  const retryUrl = appUrl('/book?billing=retry');
  const amount = amountLabel(input.invoice);
  const title = reasonTitle(input.reason);
  const body = reasonBody(input.reason);
  const firstName = target.full_name?.split(' ')[0] || 'there';
  const text = [
    `Hi ${firstName},`,
    '',
    body,
    amount ? `Amount due: ${amount}` : null,
    '',
    `Update billing: ${updateUrl}`,
    `Retry payment: ${retryUrl}`,
  ]
    .filter(Boolean)
    .join('\n');
  const html = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#111;line-height:1.5">
      <p>Hi ${escapeHtml(firstName)},</p>
      <p>${escapeHtml(body)}</p>
      ${amount ? `<p><strong>Amount due:</strong> ${escapeHtml(amount)}</p>` : ''}
      <p style="margin-top:24px">
        <a href="${escapeAttribute(updateUrl)}" style="display:inline-block;border-radius:999px;background:#f24f09;color:#111;padding:12px 18px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none">Update Billing</a>
        <a href="${escapeAttribute(retryUrl)}" style="display:inline-block;border-radius:999px;border:1px solid #f24f09;color:#f24f09;margin-left:8px;padding:11px 18px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;text-decoration:none">Retry</a>
      </p>
    </div>
  `;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${apiKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [target.email],
      reply_to: process.env.BILLING_NOTICE_REPLY_TO ?? 'ashley@stryvsocietyfit.com',
      subject: title,
      text,
      html,
    }),
  });

  if (!res.ok) {
    const message = await res.text().catch(() => '');
    throw new Error(`Billing email failed: ${res.status} ${message}`.trim());
  }

  return 'sent';
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

export async function sendBillingRecoveryNotice(input: BillingRecoveryNoticeInput): Promise<void> {
  const customerId = input.customerId ?? stripeCustomerId(input.invoice?.customer ?? null);
  const target = await targetForBilling({ ...input, customerId });
  if (!target) return;

  const payload = {
    title: reasonTitle(input.reason),
    body: reasonBody(input.reason),
    url: appUrl('/book?billing=update'),
    retryUrl: appUrl('/book?billing=retry'),
  };

  let emailStatus = 'skipped';
  let pushStatus = 'skipped';

  try {
    emailStatus = await sendBillingEmail(target, input);
  } catch (error) {
    emailStatus = error instanceof Error ? `failed:${error.message}` : 'failed';
  }

  try {
    const push = await sendBillingPushNotice(target.id, payload);
    pushStatus = push.skipped ? 'skipped_missing_vapid' : `sent:${push.sent}:removed:${push.removed}`;
  } catch (error) {
    pushStatus = error instanceof Error ? `failed:${error.message}` : 'failed';
  }

  const { error } = await serviceClient().from('billing_recovery_notices').insert({
    app_user_id: target.id,
    client_email: target.email,
    stripe_event_id: input.eventId,
    stripe_invoice_id: input.invoice?.id ?? null,
    stripe_subscription_id: input.subscriptionId ?? null,
    reason: input.reason,
    email_status: emailStatus.slice(0, 500),
    push_status: pushStatus.slice(0, 500),
  });

  if (error && error.code !== '23505') throw error;
}
