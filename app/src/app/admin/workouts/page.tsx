import { AdminWorkoutsPage } from '@/components/admin/AdminWorkoutsPage';
import { requireAdminUser } from '@/lib/auth';
import { listAdminClients } from '@/lib/bookings';

export default async function AdminWorkoutsRoute() {
  await requireAdminUser();
  const clients = await listAdminClients().catch(() => []);
  return <AdminWorkoutsPage initialClients={clients} />;
}
