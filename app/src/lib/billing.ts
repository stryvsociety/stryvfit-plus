import Stripe from 'stripe';
import { hasBookedFreeFirstSession, type AppUser } from '@/lib/auth';
import {
  BOOKING_SERVICES,
  getStripePriceId,
  type MembershipInvoiceServiceType,
} from '@/lib/bookingServices';
import { serviceClient } from '@/lib/supabase';
import { appUrl, stripe } from '@/lib/stripeClient';

export class BillingPortalUnavailableError extends Error {}
export class BillingRetryUnavailableError extends Error {}
export class MembershipInvoiceUnavailableError extends Error {}

const DAY_MS = 24 * 60 * 60 * 1000;
const MEMBERSHIP_INVOICE_DUE_DAYS = 7;
const MEMBERSHIP_INVOICE_METADATA_KEY = 'stryvfit_membership_invoice';

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
  latestInvoice: BillingInvoiceSummary | null;
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

async function ensureStripeCustomer(appUser: AppUser): Promise<string> {
  const existing = await storedCustomerIdForUser(appUser);
  if (existing) return existing;

  const customer = await stripe().customers.create(
    {
      email: appUser.email,
      name: appUser.full_name ?? undefined,
      phone: appUser.phone ?? undefined,
      metadata: { app_user_id: appUser.id, clerk_user_id: appUser.clerk_user_id },
    },
    { idempotencyKey: `stryvfit-customer:${appUser.id}` }
  );
  const { error } = await serviceClient()
    .from('app_users')
    .update({ stripe_customer_id: customer.id, updated_at: new Date().toISOString() })
    .eq('id', appUser.id);
  if (error) throw error;
  return customer.id;
}

function isOpenMembershipInvoice(invoice: Stripe.Invoice): boolean {
  return (
    invoice.metadata?.[MEMBERSHIP_INVOICE_METADATA_KEY] === 'true' &&
    ['draft', 'open'].includes(invoice.status ?? '') &&
    (invoice.amount_remaining ?? invoice.amount_due ?? 0) > 0
  );
}

async function findOpenMembershipInvoice(
  customerId: string,
  serviceType: MembershipInvoiceServiceType
): Promise<Stripe.Invoice | null> {
  const stripeClient = stripe();
  const [drafts, open] = await Promise.all([
    stripeClient.invoices.list({ customer: customerId, status: 'draft', limit: 100 }),
    stripeClient.invoices.list({ customer: customerId, status: 'open', limit: 100 }),
  ]);
  const pendingInvoices = [...open.data, ...drafts.data].filter(isOpenMembershipInvoice);
  const matchingInvoice = pendingInvoices.find((invoice) => invoice.metadata?.service_type === serviceType);
  if (matchingInvoice) return matchingInvoice;

  if (pendingInvoices.length > 0) {
    throw new MembershipInvoiceUnavailableError(
      'A different membership invoice is already open. Pay or void it in Stripe before choosing another package.'
    );
  }

  return null;
}

async function finalizeMembershipInvoice(invoice: Stripe.Invoice, idempotencyKey: string): Promise<Stripe.Invoice> {
  const finalized =
    invoice.status === 'draft'
      ? await stripe().invoices.finalizeInvoice(invoice.id, { auto_advance: false }, { idempotencyKey })
      : invoice;
  if (finalized.status !== 'open' || !finalized.hosted_invoice_url) {
    throw new MembershipInvoiceUnavailableError('Stripe could not prepare a payable membership invoice.');
  }
  return finalized;
}

export async function createMembershipInvoice(
  appUser: AppUser,
  serviceType: MembershipInvoiceServiceType
): Promise<{ invoice: Stripe.Invoice; reused: boolean }> {
  if (appUser.role !== 'client') {
    throw new MembershipInvoiceUnavailableError('Membership invoices are available from a client account only.');
  }
  if (!(await hasBookedFreeFirstSession(appUser))) {
    throw new MembershipInvoiceUnavailableError('Book your free first session before opening membership billing.');
  }

  const service = BOOKING_SERVICES[serviceType];
  const priceId = getStripePriceId(service);
  if (!priceId) {
    throw new MembershipInvoiceUnavailableError('This membership package is not configured for Stripe yet.');
  }

  const customerId = await ensureStripeCustomer(appUser);
  const existingInvoice = await findOpenMembershipInvoice(customerId, serviceType);
  if (existingInvoice) {
    return {
      invoice: await finalizeMembershipInvoice(existingInvoice, `stryvfit-membership:${appUser.id}:reuse-finalize`),
      reused: true,
    };
  }

  const stripeClient = stripe();
  const price = await stripeClient.prices.retrieve(priceId);
  if (!price.active || price.recurring) {
    throw new MembershipInvoiceUnavailableError('This membership package cannot be invoiced as a one-time charge.');
  }

  const idempotencyBase = `stryvfit-membership:${appUser.id}:${serviceType}:${Math.floor(Date.now() / 60_000)}`;
  const metadata = {
    [MEMBERSHIP_INVOICE_METADATA_KEY]: 'true',
    app_user_id: appUser.id,
    service_type: serviceType,
  };
  const draft = await stripeClient.invoices.create(
    {
      customer: customerId,
      collection_method: 'send_invoice',
      days_until_due: MEMBERSHIP_INVOICE_DUE_DAYS,
      auto_advance: false,
      description: `${service.label} membership package`,
      metadata,
      payment_settings: { payment_method_types: ['card'] },
    },
    { idempotencyKey: `${idempotencyBase}:invoice` }
  );
  await stripeClient.invoiceItems.create(
    {
      customer: customerId,
      invoice: draft.id,
      pricing: { price: priceId },
      quantity: 1,
      metadata,
    },
    { idempotencyKey: `${idempotencyBase}:item` }
  );
  return {
    invoice: await finalizeMembershipInvoice(draft, `${idempotencyBase}:finalize`),
    reused: false,
  };
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

async function billingContext(appUser: AppUser) {
  const customerId = await storedCustomerIdForUser(appUser);
  if (!customerId) {
    return { customerId: null, subscription: null, invoice: null };
  }

  const stripeClient = stripe();
  const subscriptions = await stripeClient.subscriptions.list({
    customer: customerId,
    status: 'all',
    limit: 10,
    expand: ['data.latest_invoice', 'data.items.data.price.product'],
  });
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

  return { customerId, subscription, invoice };
}

export async function getBillingSummary(appUser: AppUser): Promise<BillingSummary> {
  const { customerId, subscription, invoice } = await billingContext(appUser);
  const status = (subscription?.status ?? 'none') as BillingStatus;
  const requiresPayment = subscriptionRequiresPayment(status) || invoiceRequiresPayment(invoice);
  const currentPeriodEnd = subscriptionCurrentPeriodEnd(subscription);
  const dueDate = timestampIso(invoice?.due_date) ?? timestampIso(invoice?.next_payment_attempt) ?? timestampIso(currentPeriodEnd);
  const daysPastDue = calculateDaysPastDue(requiresPayment, dueDate);
  const canRetry = Boolean(
    invoice?.id &&
      invoiceRequiresPayment(invoice) &&
      invoice.collection_method === 'charge_automatically' &&
      ['open', 'draft'].includes(invoice.status ?? '')
  );

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
    latestInvoice: invoiceSummary(invoice),
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
