import { ClientPhaseFlow } from '@/components/client/ClientPhaseFlow';
import { hasBookedFreeFirstSession, requireAppUser } from '@/lib/auth';
import { listClientAppointmentPlans } from '@/lib/adminAppointmentPlans';
import { listClientWorkoutRoutines } from '@/lib/adminWorkoutRoutines';
import { parseBookingService } from '@/lib/bookingServices';
import { FIRST_SESSION_BOOKING_PATH } from '@/lib/routes';
import { redirect } from 'next/navigation';

type BookPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookPage({ searchParams }: BookPageProps) {
  const appUser = await requireAppUser();
  const params = await searchParams;
  const serviceParam = Array.isArray(params?.service) ? params?.service[0] : params?.service;
  const serviceType = parseBookingService(serviceParam);

  if (appUser.role === 'client' && serviceType !== 'free' && !(await hasBookedFreeFirstSession(appUser))) {
    redirect(FIRST_SESSION_BOOKING_PATH);
  }

  const [appointmentPlansResult, workoutRoutinesResult] = await Promise.allSettled([
    listClientAppointmentPlans(appUser, 5),
    listClientWorkoutRoutines(appUser, 5),
  ]);

  return (
    <ClientPhaseFlow
      appointmentPlans={appointmentPlansResult.status === 'fulfilled' ? appointmentPlansResult.value : []}
      workoutRoutines={workoutRoutinesResult.status === 'fulfilled' ? workoutRoutinesResult.value : []}
    />
  );
}
