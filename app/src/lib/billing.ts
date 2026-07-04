import Stripe from 'stripe';
import type { AppUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';
import { appUrl, stripe } from '@/lib/stripeClient';

export class BillingPortalUnavailableError extends Error {}
export class BillingRetryUnavailableError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;
const PAYMENT_METHOD_CONFIG = [
  { id: 'card' as const, label: 'Credit/debit card', env: 'STRIPE_ACCEPTS_CARD', fallback: true },
  { id: 'apple_pay' as const, label: 'Apple Pay', env: 'STRIPE_ACCEPTS_APPLE_PAY', fallback: true },
  { id: 'cashapp' as const, label: 'Cash App Pay', env: 'STRIPE_ACCEPTS_CASH_APP_PAY', fallback: false },
  { id: 'paypal' as const, label: 'PayPal', env: 'STRIPE_ACCEPTS_PAYPAL', fallback: false },
];

export type BillingStatus =
  | 'none'
  | 'incomplete'
  | 'incomplete_expired'
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'paused';

export type BillingPaymentMethodSummary = {
  type: string;
  label: string;
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  wallet?: string;
};

export type BillingInvoiceSummary = {
  id: string;
  status: Stripe.Invoice.Status | null;
  amountRemaining: number | null;
  amountDueLabel: string | null;
  hostedInvoiceUrl: string | null;
  nextPaymentAttempt: string | null;
  attemptCount: number | null;
};

export type BillingSummary = {
  hasBilling: boolean;
  subscriptionId: string | null;
  status: BillingStatus;
  statusLabel: string;
  planName: string | null;
  amountLabel: string | null;
  renewalDate: string | null;
  dueDate: string | null;
  daysPastDue: number;
  requiresPayment: boolean;
  bookingLocked: boolean;
  canRetry: boolean;
  canUpdateBilling: boolean;
  paymentMethod: BillingPaymentMethodSummary | null;
  latestInvoice: BillingInvoiceSummary | null;
  acceptedPaymentMethods: Array<{ id: 'card' | 'apple_pay' | 'cashapp' | 'paypal'; label: string; available: boolean }>;
};

function stripeCustomerId(value: Stripe.Checkout.Session['customer'] | Stripe.Subscription['customer'] | null): string | null {
  if (!value) return null;
  if (typeof value === 'string') return value;
  return 'deleted' in value && value.deleted ? null : value.id;
}

function stripeSubscriptionId(value: Stripe.Checkout.Session['subscription'] | null): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}

function safeReturnPath(path: unknown): string {
  if (typeof path !== 'string') return '/book';
  if (!path.startsWith('/') || path.startsWith('//')) return '/book';
  return path;
}

export async function syncStripeSessionBilling(session: Stripe.Checkout.Session): Promise<void> {
  const bookingId = session.metadata?.booking_id ?? session.client_reference_id;
  const customerId = stripeCustomerId(session.customer);
  const subscriptionId = stripeSubscriptionId(session.subscription);
  if (!bookingId || (!customerId && !subscriptionId)) return;

  const sb = serviceClient();
  const booking = await sb
    .from('bookings')
    .select('app_user_id, client_email')
    .eq('id', bookingId)
    .maybeSingle();

  if (booking.error) throw booking.error;
  if (!booking.data) return;

  const updates: Record<string, string> = { updated_at: new Date().toISOString() };
  if (customerId) updates.stripe_customer_id = customerId;
  if (subscriptionId) {
    updates.stripe_subscription_id = subscriptionId;
    updates.subscription_status = 'active';
  }

  const profileId = booking.data.app_user_id as string | null;
  const email = booking.data.client_email as string | null;
  const updated = profileId
    ? await sb.from('app_users').update(updates).eq('id', profileId)
    : email
      ? await sb.from('app_users').update(updates).eq('email', email.toLowerCase())
      : null;

  if (updated?.error) throw updated.error;
}

export async function syncStripeSubscriptionBilling(subscription: Stripe.Subscription): Promise<void> {
  const customerId = stripeCustomerId(subscription.customer);
  if (!customerId) return;

  const { error } = await serviceClient()
    .from('app_users')
    .update({
      stripe_customer_id: customerId,
      stripe_subscription_id: subscription.id,
      subscription_status: subscription.status,
      updated_at: new Date().toISOString(),
    })
    .or(`stripe_customer_id.eq.${customerId},stripe_subscription_id.eq.${subscription.id}`);

  if (error) throw error;
}

export async function storedCustomerIdForUser(appUser: AppUser): Promise<string | null> {
  if (appUser.stripe_customer_id) return appUser.stripe_customer_id;

  const sb = serviceClient();
  const byUser = await sb
    .from('bookings')
    .select('stripe_customer_id')
    .eq('app_user_id', appUser.id)
    .not('stripe_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byUser.error) throw byUser.error;
  if (byUser.data?.stripe_customer_id) return byUser.data.stripe_customer_id as string;

  const byEmail = await sb
    .from('bookings')
    .select('stripe_customer_id')
    .eq('client_email', appUser.email)
    .not('stripe_customer_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (byEmail.error) throw byEmail.error;
  return (byEmail.data?.stripe_customer_id as string | undefined) ?? null;
}

function statusLabel(status: BillingStatus): string {
  const labels: Record<BillingStatus, string> = {
    none: 'No subscription',
    incomplete: 'Payment setup incomplete',
    incomplete_expired: 'Payment setup expired',
    trialing: 'Trialing',
    active: 'Active',
    past_due: 'Past due',
    canceled: 'Canceled',
    unpaid: 'Unpaid',
    paused: 'Paused',
  };
  return labels[status] ?? prettyStatus(status);
}

function prettyStatus(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .split('_')
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(' ');
}

function moneyLabel(amount: number | null | undefined, currency: string | null | undefined): string | null {
  if (amount == null || !currency) return null;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
  }).format(amount / 100);
}

function timestampIso(seconds: number | null | undefined): string | null {
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString();
}

function productName(product: string | Stripe.Product | Stripe.DeletedProduct | null): string | null {
  if (!product || typeof product === 'string') return null;
  if ('deleted' in product && product.deleted) return null;
  return product.name ?? null;
}

function subscriptionPlanName(subscription: Stripe.Subscription | null): string | null {
  const item = subscription?.items.data[0];
  if (!item) return null;
  return productName(item.price.product) ?? item.price.nickname ?? (prettyStatus(item.price.lookup_key) || null);
}

function subscriptionCurrentPeriodEnd(subscription: Stripe.Subscription | null): number | null {
  const value = (subscription as (Stripe.Subscription & { current_period_end?: number | null }) | null)
    ?.current_period_end;
  return typeof value === 'number' ? value : null;
}

function subscriptionAmountLabel(subscription: Stripe.Subscription | null): string | null {
  const price = subscription?.items.data[0]?.price;
  if (!price) return null;
  const amount = moneyLabel(price.unit_amount, price.currency);
  if (!amount) return null;
  return price.recurring?.interval ? `${amount}/${price.recurring.interval}` : amount;
}

function paymentMethodLabel(paymentMethod: Stripe.PaymentMethod): BillingPaymentMethodSummary {
  if (paymentMethod.type === 'card' && paymentMethod.card) {
    const wallet = paymentMethod.card.wallet?.type ? prettyStatus(paymentMethod.card.wallet.type) : undefined;
    const brand = prettyStatus(paymentMethod.card.brand);
    const suffix = paymentMethod.card.last4 ? ` ending ${paymentMethod.card.last4}` : '';
    return {
      type: paymentMethod.type,
      label: `${wallet ?? brand}${suffix}`,
      brand,
      last4: paymentMethod.card.last4 ?? undefined,
      expMonth: paymentMethod.card.exp_month ?? undefined,
      expYear: paymentMethod.card.exp_year ?? undefined,
      wallet,
    };
  }

  if (paymentMethod.type === 'cashapp') {
    return { type: paymentMethod.type, label: 'Cash App Pay' };
  }

  if (paymentMethod.type === 'paypal') {
    return { type: paymentMethod.type, label: 'PayPal' };
  }

  return { type: paymentMethod.type, label: prettyStatus(paymentMethod.type) };
}

function isExpandedPaymentMethod(value: unknown): value is Stripe.PaymentMethod {
  return Boolean(value && typeof value === 'object' && 'object' in value && (value as { object?: string }).object === 'payment_method');
}

async function retrievePaymentMethod(
  stripeClient: Stripe,
  customer: Stripe.Customer | null,
  subscription: Stripe.Subscription | null
): Promise<BillingPaymentMethodSummary | null> {
  const subscriptionPaymentMethod = subscription?.default_payment_method;
  if (isExpandedPaymentMethod(subscriptionPaymentMethod)) return paymentMethodLabel(subscriptionPaymentMethod);
  if (typeof subscriptionPaymentMethod === 'string') {
    return paymentMethodLabel(await stripeClient.paymentMethods.retrieve(subscriptionPaymentMethod));
  }

  const customerPaymentMethod = customer?.invoice_settings.default_payment_method;
  if (isExpandedPaymentMethod(customerPaymentMethod)) return paymentMethodLabel(customerPaymentMethod);
  if (typeof customerPaymentMethod === 'string') {
    return paymentMethodLabel(await stripeClient.paymentMethods.retrieve(customerPaymentMethod));
  }

  if (!customer?.id) return null;
  const cards = await stripeClient.paymentMethods.list({ customer: customer.id, type: 'card', limit: 1 });
  return cards.data[0] ? paymentMethodLabel(cards.data[0]) : null;
}

function invoiceSummary(invoice: Stripe.Invoice | null): BillingInvoiceSummary | null {
  if (!invoice) return null;
  return {
    id: invoice.id,
    status: invoice.status,
    amountRemaining: invoice.amount_remaining ?? null,
    amountDueLabel: moneyLabel(invoice.amount_remaining, invoice.currency),
    hostedInvoiceUrl: invoice.hosted_invoice_url ?? null,
    nextPaymentAttempt: timestampIso(invoice.next_payment_attempt),
    attemptCount: invoice.attempt_count ?? null,
  };
}

function invoiceRequiresPayment(invoice: Stripe.Invoice | null): boolean {
  if (!invoice) return false;
  return (invoice.amount_remaining ?? 0) > 0 && invoice.status !== 'paid' && invoice.status !== 'void';
}

function subscriptionRequiresPayment(status: BillingStatus): boolean {
  return ['incomplete', 'past_due', 'unpaid', 'paused'].includes(status);
}

function chooseSubscription(subscriptions: Stripe.Subscription[], preferredId: string | null): Stripe.Subscription | null {
  if (preferredId) {
    const preferred = subscriptions.find((subscription) => subscription.id === preferredId);
    if (preferred) return preferred;
  }

  const priority = ['past_due', 'unpaid', 'incomplete', 'active', 'trialing', 'paused', 'canceled'];
  return (
    [...subscriptions].sort((a, b) => priority.indexOf(a.status) - priority.indexOf(b.status))[0] ?? null
  );
}

function calculateDaysPastDue(requiresPayment: boolean, dueIso: string | null): number {
  if (!requiresPayment || !dueIso) return 0;
  const due = new Date(dueIso);
  if (Number.isNaN(due.getTime()) || due.getTime() > Date.now()) return 0;
  return Math.floor((Date.now() - due.getTime()) / DAY_MS);
}

function envBoolean(name: string, fallback: boolean): boolean {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(value)) return true;
  if (['0', 'false', 'no', 'off'].includes(value)) return false;
  return fallback;
}

function paymentMethodAvailability(): BillingSummary['acceptedPaymentMethods'] {
  return PAYMENT_METHOD_CONFIG.map((method) => ({
    id: method.id,
    label: method.label,
    available: envBoolean(method.env, method.fallback),
  }));
}

async function billingContext(appUser: AppUser) {
  const customerId = await storedCustomerIdForUser(appUser);
  if (!customerId) {
    return { customerId: null, customer: null, subscription: null, invoice: null };
  }

  const stripeClient = stripe();
  const [customerResult, subscriptions] = await Promise.all([
    stripeClient.customers
      .retrieve(customerId, { expand: ['invoice_settings.default_payment_method'] })
      .catch(() => null),
    stripeClient.subscriptions.list({
      customer: customerId,
      status: 'all',
      limit: 10,
      expand: ['data.default_payment_method', 'data.latest_invoice', 'data.items.data.price.product'],
    }),
  ]);

  const customer =
    customerResult && !('deleted' in customerResult && customerResult.deleted) ? (customerResult as Stripe.Customer) : null;
  const subscription = chooseSubscription(subscriptions.data, appUser.stripe_subscription_id ?? null);
  const expandedInvoice = subscription?.latest_invoice;
  const invoice =
    expandedInvoice && typeof expandedInvoice === 'object'
      ? (expandedInvoice as Stripe.Invoice)
      : (
          await stripeClient.invoices.list({
            customer: customerId,
            subscription: subscription?.id,
            limit: 1,
          })
        ).data[0] ?? null;

  return { customerId, customer, subscription, invoice };
}

export async function getBillingSummary(appUser: AppUser): Promise<BillingSummary> {
  const { customerId, customer, subscription, invoice } = await billingContext(appUser);
  const stripeClient = stripe();
  const acceptedPaymentMethods = paymentMethodAvailability();
  const paymentMethod = await retrievePaymentMethod(stripeClient, customer, subscription);
  const status = (subscription?.status ?? 'none') as BillingStatus;
  const requiresPayment = subscriptionRequiresPayment(status) || invoiceRequiresPayment(invoice);
  const currentPeriodEnd = subscriptionCurrentPeriodEnd(subscription);
  const dueDate = timestampIso(invoice?.due_date) ?? timestampIso(invoice?.next_payment_attempt) ?? timestampIso(currentPeriodEnd);
  const daysPastDue = calculateDaysPastDue(requiresPayment, dueDate);
  const canRetry = Boolean(invoice?.id && invoiceRequiresPayment(invoice) && ['open', 'draft'].includes(invoice.status ?? ''));

  return {
    hasBilling: Boolean(customerId),
    subscriptionId: subscription?.id ?? null,
    status,
    statusLabel: statusLabel(status),
    planName: subscriptionPlanName(subscription),
    amountLabel: subscriptionAmountLabel(subscription),
    renewalDate: timestampIso(currentPeriodEnd),
    dueDate,
    daysPastDue,
    requiresPayment,
    bookingLocked: daysPastDue >= 7 || status === 'unpaid' || status === 'canceled' || status === 'incomplete_expired',
    canRetry,
    canUpdateBilling: Boolean(customerId),
    paymentMethod,
    latestInvoice: invoiceSummary(invoice),
    acceptedPaymentMethods,
  };
}

export async function retryLatestInvoice(appUser: AppUser): Promise<BillingSummary> {
  const { invoice } = await billingContext(appUser);
  if (!invoice?.id || !invoiceRequiresPayment(invoice)) {
    throw new BillingRetryUnavailableError('No unpaid subscription invoice is ready to retry.');
  }

  if (!['open', 'draft'].includes(invoice.status ?? '')) {
    throw new BillingRetryUnavailableError('This invoice is not in a retryable state yet.');
  }

  await stripe().invoices.pay(invoice.id);
  return getBillingSummary(appUser);
}

export async function createBillingPortalUrl(appUser: AppUser, returnPath: unknown): Promise<string> {
  const customerId = await storedCustomerIdForUser(appUser);
  if (!customerId) {
    throw new BillingPortalUnavailableError('Book a paid package first, then billing changes will open here.');
  }

  const stripeClient = stripe();
  const configurations = await stripeClient.billingPortal.configurations.list({ limit: 1, active: true });
  if (configurations.data.length === 0) {
    throw new BillingPortalUnavailableError('Billing controls are being set up. Contact StryvFit+ to update billing for now.');
  }

  const session = await stripeClient.billingPortal.sessions.create({
    customer: customerId,
    return_url: appUrl(safeReturnPath(returnPath)),
  });

  return session.url;
}
