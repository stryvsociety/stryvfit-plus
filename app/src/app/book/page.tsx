import { ClientPhaseFlow } from '@/components/client/ClientPhaseFlow';
import { hasBookedFreeFirstSession, requireAppUser } from '@/lib/auth';
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

  return <ClientPhaseFlow />;
}
