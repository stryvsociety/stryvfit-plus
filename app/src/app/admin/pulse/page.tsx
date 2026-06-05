import { TrainerOpsStudio } from '@/components/admin/TrainerOpsStudio';
import { requireAdminUser } from '@/lib/auth';
import { listAdminBookings, listAdminClients, type AdminBookingSummary, type AdminClientSummary } from '@/lib/bookings';
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

export default async function AdminPulsePage() {
  await requireAdminUser();
  const [bookingsResult, clientsResult] = await Promise.allSettled([
    listAdminBookings(),
    listAdminClients(),
  ]);

  const bookings: AdminBookingSummary[] = bookingsResult.status === 'fulfilled' ? bookingsResult.value : [];
  const clients: AdminClientSummary[] = clientsResult.status === 'fulfilled' ? clientsResult.value : [];

  if (bookingsResult.status === 'rejected') {
    await reportAdminPulseLoadFailure('bookings', bookingsResult.reason);
  }
  if (clientsResult.status === 'rejected') {
    await reportAdminPulseLoadFailure('clients', clientsResult.reason);
  }

  return <TrainerOpsStudio initialBookings={bookings} initialClients={clients} />;
}
