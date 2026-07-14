import { afterAll, beforeEach, describe, expect, mock, test } from 'bun:test';
import type { AppUser } from '@/lib/auth';

const hasBookedFreeFirstSession = mock<() => Promise<boolean>>();
const priceRetrieve = mock();
const customerCreate = mock();
const customerUpdate = mock();
const invoiceList = mock();
const invoiceCreate = mock();
const invoiceRetrieve = mock();
const invoiceFinalize = mock();
const invoiceItemCreate = mock();

const authModule = await import('@/lib/auth');
const stripeClientModule = await import('@/lib/stripeClient');
const supabaseModule = await import('@/lib/supabase');

mock.module('@/lib/auth', () => ({ ...authModule, hasBookedFreeFirstSession }));
mock.module('@/lib/stripeClient', () => ({
  ...stripeClientModule,
  stripe: () => ({
    prices: { retrieve: priceRetrieve },
    customers: { create: customerCreate, update: customerUpdate },
    invoices: {
      list: invoiceList,
      create: invoiceCreate,
      retrieve: invoiceRetrieve,
      finalizeInvoice: invoiceFinalize,
    },
    invoiceItems: { create: invoiceItemCreate },
  }),
  appUrl: (path = '') => `https://stryvsocietyfit.com${path}`,
}));
mock.module('@/lib/supabase', () => ({
  ...supabaseModule,
  serviceClient: () => ({
    from: () => {
      throw new Error('Supabase should not be needed for a client with a stored Stripe customer.');
    },
  }),
}));

const {
  createFreeFirstSessionInvoice,
  createMembershipInvoice,
  MembershipInvoiceUnavailableError,
} = await import('@/lib/billing');

const originalSessions4Price = process.env.NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4;

const client: AppUser = {
  id: 'client_123',
  clerk_user_id: 'user_123',
  email: 'client@example.com',
  full_name: 'Client Example',
  phone: '+13055550198',
  role: 'client',
  stripe_customer_id: 'cus_123',
  stripe_subscription_id: null,
  subscription_status: null,
  profile_goal: null,
  emergency_contact_name: null,
  emergency_contact_phone: null,
};

function draftInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'in_membership_draft',
    status: 'draft',
    amount_due: 0,
    amount_remaining: 0,
    metadata: {
      stryvfit_membership_invoice: 'true',
      app_user_id: client.id,
      service_type: 'sessions_4',
    },
    ...overrides,
  };
}

function payableInvoice(overrides: Record<string, unknown> = {}) {
  return {
    ...draftInvoice(),
    status: 'open',
    amount_due: 12000,
    amount_remaining: 12000,
    hosted_invoice_url: 'https://invoice.stripe.com/i/acct_membership',
    ...overrides,
  };
}

beforeEach(() => {
  process.env.NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4 = 'price_sessions_4';
  hasBookedFreeFirstSession.mockReset();
  priceRetrieve.mockReset();
  customerCreate.mockReset();
  customerUpdate.mockReset();
  invoiceList.mockReset();
  invoiceCreate.mockReset();
  invoiceRetrieve.mockReset();
  invoiceFinalize.mockReset();
  invoiceItemCreate.mockReset();

  hasBookedFreeFirstSession.mockResolvedValue(true);
  priceRetrieve.mockResolvedValue({ active: true, recurring: null });
  customerUpdate.mockResolvedValue({ id: 'cus_123' });
  invoiceList.mockResolvedValue({ data: [] });
  invoiceItemCreate.mockResolvedValue({ id: 'ii_membership' });
});

afterAll(() => {
  if (originalSessions4Price === undefined) delete process.env.NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4;
  else process.env.NEXT_PUBLIC_STRIPE_PRICE_SESSIONS_4 = originalSessions4Price;
});

describe('hosted membership invoices', () => {
  test('creates a card-only, seven-day hosted invoice after the free-session gate passes', async () => {
    const draft = draftInvoice();
    const open = payableInvoice();
    invoiceCreate.mockResolvedValue(draft);
    invoiceRetrieve.mockResolvedValue({ ...draft, amount_due: 12000, amount_remaining: 12000 });
    invoiceFinalize.mockResolvedValue(open);

    const result = await createMembershipInvoice(client, 'sessions_4');

    expect(result).toEqual({ invoice: open, reused: false });
    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        collection_method: 'send_invoice',
        days_until_due: 7,
        payment_settings: { payment_method_types: ['card'] },
        metadata: expect.objectContaining({
          stryvfit_membership_invoice: 'true',
          app_user_id: client.id,
          service_type: 'sessions_4',
        }),
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
    expect(invoiceItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        invoice: draft.id,
        pricing: { price: 'price_sessions_4' },
        quantity: 1,
      }),
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
    expect(invoiceFinalize).toHaveBeenCalledWith(
      draft.id,
      { auto_advance: false },
      expect.objectContaining({ idempotencyKey: expect.any(String) })
    );
  });

  test('recovers a zero-dollar tagged draft instead of creating a duplicate invoice', async () => {
    const partialDraft = draftInvoice();
    const payableDraft = draftInvoice({ amount_due: 12000, amount_remaining: 12000 });
    const open = payableInvoice();
    invoiceList.mockImplementation(({ status }: { status: string }) =>
      Promise.resolve({ data: status === 'draft' ? [partialDraft] : [] })
    );
    invoiceRetrieve
      .mockResolvedValueOnce(partialDraft)
      .mockResolvedValueOnce(payableDraft)
      .mockResolvedValueOnce(payableDraft);
    invoiceFinalize.mockResolvedValue(open);

    const result = await createMembershipInvoice(client, 'sessions_4');

    expect(result).toEqual({ invoice: open, reused: true });
    expect(invoiceCreate).not.toHaveBeenCalled();
    expect(invoiceItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        invoice: partialDraft.id,
        pricing: { price: 'price_sessions_4' },
      }),
      expect.objectContaining({ idempotencyKey: `stryvfit-membership:${partialDraft.id}:recover-item` })
    );
  });

  test('refuses an invoice before a client has booked the free first session', async () => {
    hasBookedFreeFirstSession.mockResolvedValue(false);

    await expect(createMembershipInvoice(client, 'sessions_4')).rejects.toBeInstanceOf(MembershipInvoiceUnavailableError);
    expect(priceRetrieve).not.toHaveBeenCalled();
    expect(invoiceCreate).not.toHaveBeenCalled();
  });

  test('records a free first session as a paid zero-dollar Stripe invoice with the current client details', async () => {
    const draft = {
      id: 'in_free_session',
      status: 'draft',
      amount_due: 0,
      amount_remaining: 0,
      lines: { data: [] },
      metadata: {
        stryvfit_free_first_session_invoice: 'true',
        booking_id: 'booking_123',
      },
    };
    const paid = {
      ...draft,
      status: 'paid',
      hosted_invoice_url: 'https://invoice.stripe.com/i/free-session',
    };
    invoiceCreate.mockResolvedValue(draft);
    invoiceRetrieve.mockResolvedValue(draft);
    invoiceFinalize.mockResolvedValue(paid);

    const result = await createFreeFirstSessionInvoice(client, 'booking_123', {
      name: 'Client Example',
      phone: '+13055550198',
    });

    expect(result).toEqual({ customerId: 'cus_123', invoice: paid, reused: false });
    expect(customerUpdate).toHaveBeenCalledWith(
      'cus_123',
      expect.objectContaining({ email: client.email, name: 'Client Example', phone: '+13055550198' })
    );
    expect(invoiceCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        collection_method: 'send_invoice',
        days_until_due: 1,
        pending_invoice_items_behavior: 'exclude',
        metadata: expect.objectContaining({
          stryvfit_free_first_session_invoice: 'true',
          booking_id: 'booking_123',
          service_type: 'free',
        }),
      }),
      expect.objectContaining({ idempotencyKey: 'stryvfit-free-session:booking_123:invoice' })
    );
    expect(invoiceItemCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_123',
        invoice: 'in_free_session',
        amount: 0,
        currency: 'usd',
        description: 'Free first session',
      }),
      expect.objectContaining({ idempotencyKey: 'stryvfit-free-session:in_free_session:item' })
    );
  });
});
