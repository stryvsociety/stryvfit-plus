import { ClientAccountPage } from '@/components/client/ClientAccountPage';
import { AppShell } from '@/components/layout/AppShell';
import { requireAppUser } from '@/lib/auth';
import { listClientBookings } from '@/lib/bookings';

export const dynamic = 'force-dynamic';

export default async function AccountPage() {
  const appUser = await requireAppUser();
  const bookings = await listClientBookings(appUser, 20);

  return (
    <AppShell>
      <ClientAccountPage
        initialBookings={bookings}
        initialProfile={{
          email: appUser.email,
          emergencyContactName: appUser.emergency_contact_name,
          emergencyContactPhone: appUser.emergency_contact_phone,
          fullName: appUser.full_name,
          phone: appUser.phone,
          profileGoal: appUser.profile_goal,
        }}
      />
    </AppShell>
  );
}
