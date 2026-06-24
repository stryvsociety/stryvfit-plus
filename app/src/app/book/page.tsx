import { ClientPhaseFlow } from '@/components/client/ClientPhaseFlow';
import { hasBookedFreeFirstSession, requireAppUser } from '@/lib/auth';
import { listClientAppointmentPlans } from '@/lib/adminAppointmentPlans';
import { listClientWorkoutRoutines } from '@/lib/adminWorkoutRoutines';
import { parseBookingService, type BookingServiceType } from '@/lib/bookingServices';
import { FIRST_SESSION_BOOKING_PATH, RETURNING_MEMBER_BOOKING_PATH } from '@/lib/routes';
import { redirect } from 'next/navigation';

type BookPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookPage({ searchParams }: BookPageProps) {
  const appUser = await requireAppUser();
  const params = await searchParams;
  const serviceParam = Array.isArray(params?.service) ? params?.service[0] : params?.service;
  const requestedServiceType = serviceParam ? parseBookingService(serviceParam) : null;
  let serviceType: BookingServiceType = requestedServiceType ?? 'free';

  if (appUser.role === 'client') {
    const hasFirstSession = await hasBookedFreeFirstSession(appUser);

    if (requestedServiceType === 'free' && hasFirstSession) {
      redirect(RETURNING_MEMBER_BOOKING_PATH);
    }

    if (requestedServiceType && requestedServiceType !== 'free' && !hasFirstSession) {
      redirect(FIRST_SESSION_BOOKING_PATH);
    }

    serviceType = requestedServiceType ?? (hasFirstSession ? 'sessions_4' : 'free');
  }

  const [appointmentPlansResult, workoutRoutinesResult] = await Promise.allSettled([
    listClientAppointmentPlans(appUser, 5),
    listClientWorkoutRoutines(appUser, 5),
  ]);

  return (
    <ClientPhaseFlow
      appointmentPlans={appointmentPlansResult.status === 'fulfilled' ? appointmentPlansResult.value : []}
      initialServiceType={serviceType}
      workoutRoutines={workoutRoutinesResult.status === 'fulfilled' ? workoutRoutinesResult.value : []}
    />
  );
}
