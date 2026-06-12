import { AdminWorkoutsPage } from '@/components/admin/AdminWorkoutsPage';
import { requireAdminUser } from '@/lib/auth';

export default async function AdminWorkoutsRoute() {
  await requireAdminUser();
  return <AdminWorkoutsPage />;
}
