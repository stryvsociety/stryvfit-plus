import { ClientPhaseFlow } from '@/components/client/ClientPhaseFlow';
import { FirstSessionBookingFlow } from '@/components/booking/FirstSessionBookingFlow';
import { hasBookedFreeFirstSession, requireAppUser } from '@/lib/auth';
import { listClientAppointmentPlans } from '@/lib/adminAppointmentPlans';
import { listClientWorkoutRoutines } from '@/lib/adminWorkoutRoutines';
import { confirmPaidBookingReturn } from '@/lib/bookings';
import { parseBookingService, type BookingServiceType } from '@/lib/bookingServices';
import { RETURNING_MEMBER_BOOKING_PATH } from '@/lib/routes';
import { redirect } from 'next/navigation';

type BookPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function BookPage({ searchParams }: BookPageProps) {
  const appUser = await requireAppUser();
  const params = await searchParams;
  const serviceParam = Array.isArray(params?.service) ? params?.service[0] : params?.service;
  const bookingParam = Array.isArray(params?.booking) ? params?.booking[0] : params?.booking;
  const bookingErrorParam = Array.isArray(params?.booking_error) ? params?.booking_error[0] : params?.booking_error;
  const intentParam = Array.isArray(params?.intent) ? params?.intent[0] : params?.intent;
  const sessionId = Array.isArray(params?.session_id) ? params?.session_id[0] : params?.session_id;
  const requestedServiceType = serviceParam ? parseBookingService(serviceParam) : null;
  let serviceType: BookingServiceType = requestedServiceType ?? 'free';

  if (bookingParam === 'success' && typeof sessionId === 'string') {
    const returnStatus = await confirmPaidBookingReturn(appUser, sessionId).catch(() => ({ status: 'pending' as const }));
    if (returnStatus.status === 'confirmed') redirect('/book?booking=confirmed&intent=first-session');
    if (returnStatus.status === 'calendar_pending') redirect('/book?booking=calendar_pending&intent=first-session');
  }

  if (appUser.role === 'client') {
    const hasFirstSession = await hasBookedFreeFirstSession(appUser);
    const isFirstSessionReturn =
      intentParam === 'first-session' &&
      (bookingParam === 'success' ||
        bookingParam === 'confirmed' ||
        bookingParam === 'calendar_pending' ||
        bookingParam === 'cancelled');
    const showFirstSessionFlow = !hasFirstSession || isFirstSessionReturn;

    if (requestedServiceType === 'free' && hasFirstSession && !showFirstSessionFlow) {
      redirect(RETURNING_MEMBER_BOOKING_PATH);
    }

    if (showFirstSessionFlow) {
      return (
        <FirstSessionBookingFlow
          initialBookingStatus={bookingParam ?? null}
          initialBookingError={bookingErrorParam === 'checkout' ? 'checkout' : null}
          initialServiceType={requestedServiceType ?? 'free'}
          profile={{
            email: appUser.email,
            fullName: appUser.full_name,
            phone: appUser.phone,
          }}
        />
      );
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
