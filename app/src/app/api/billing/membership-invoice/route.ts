import { NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth';
import {
  createMembershipInvoice,
  MembershipInvoiceUnavailableError,
} from '@/lib/billing';
import { parseMembershipInvoiceService } from '@/lib/bookingServices';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const appUser = await requireApiUser();
  if (appUser instanceof NextResponse) return appUser;

  const body = (await req.json().catch(() => null)) as { serviceType?: unknown } | null;
  const serviceType = parseMembershipInvoiceService(body?.serviceType);
  if (!serviceType) {
    return NextResponse.json({ error: 'Choose a valid in-person membership package.' }, { status: 400 });
  }

  try {
    const { invoice, reused } = await createMembershipInvoice(appUser, serviceType);
    if (!invoice.hosted_invoice_url) {
      throw new MembershipInvoiceUnavailableError('Stripe did not return a hosted invoice link.');
    }
    return NextResponse.json({
      ok: true,
      invoiceId: invoice.id,
      reused,
      url: invoice.hosted_invoice_url,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to prepare membership billing.';
    return NextResponse.json({ error: message }, { status: error instanceof MembershipInvoiceUnavailableError ? 409 : 500 });
  }
}
