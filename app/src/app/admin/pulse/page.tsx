import { TrainerOpsStudio, type AdminTab } from '@/components/admin/TrainerOpsStudio';
import { requireAdminUser } from '@/lib/auth';
import {
  adminClientSummariesFromBookings,
  listAdminBookings,
  listAdminClients,
  mergeAdminClientSummaries,
  type AdminBookingSummary,
  type AdminClientSummary,
} from '@/lib/bookings';
import { captureServerIncident } from '@/lib/serverIncidents';

async function reportAdminPulseLoadFailure(source: string, error: unknown) {
  try {
    await captureServerIncident({
      source: 'api',
      route: '/admin/pulse',
      severity: 'high',
      message: error instanceof Error ? error.message : `${source} failed to load`,
      context: { source },
      admin_action: 'Keep the admin dashboard visible and inspect the failing admin data dependency.',
    });
  } catch {
    // The admin dashboard should still render if incident capture is also unavailable.
  }
}

type AdminPulsePageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AdminPulsePage({ searchParams }: AdminPulsePageProps) {
  await requireAdminUser();
  const query = await searchParams;
  const [bookingsResult, clientsResult] = await Promise.allSettled([
    listAdminBookings(),
    listAdminClients(),
  ]);

  const bookings: AdminBookingSummary[] = bookingsResult.status === 'fulfilled' ? bookingsResult.value : [];
  const profileClients: AdminClientSummary[] = clientsResult.status === 'fulfilled' ? clientsResult.value : [];
  const clients = mergeAdminClientSummaries(profileClients, adminClientSummariesFromBookings(bookings));

  if (bookingsResult.status === 'rejected') {
    await reportAdminPulseLoadFailure('bookings', bookingsResult.reason);
  }
  if (clientsResult.status === 'rejected') {
    await reportAdminPulseLoadFailure('clients', clientsResult.reason);
  }

  return <TrainerOpsStudio initialBookings={bookings} initialClients={clients} initialTab={adminTabFromQuery(query?.tab)} />;
}

function adminTabFromQuery(value: string | string[] | undefined): AdminTab {
  const tab = Array.isArray(value) ? value[0] : value;
  return tab === 'clients' ? tab : 'appointments';
}
