import { TrainerOpsStudio } from '@/components/admin/TrainerOpsStudio';
import { requireAdminUser } from '@/lib/auth';
import { listAdminBookings } from '@/lib/bookings';

export default async function AdminPulsePage() {
  await requireAdminUser();
  const bookings = await listAdminBookings();
  return <TrainerOpsStudio initialBookings={bookings} />;
}
