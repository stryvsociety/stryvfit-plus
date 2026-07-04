import { FirstSessionBookingFlow } from '@/components/booking/FirstSessionBookingFlow';

export const dynamic = 'force-dynamic';

type SandboxBookingFlowPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export default async function SandboxBookingFlowPage({ searchParams }: SandboxBookingFlowPageProps) {
  const params = await searchParams;
  const bookingParam = Array.isArray(params?.booking) ? params.booking[0] : params?.booking;

  return (
    <FirstSessionBookingFlow
      availabilityEndpoint="/api/sandbox/booking-availability"
      checkoutEndpoint="/api/sandbox/booking-checkout"
      forceMobileLayout
      initialBookingStatus={bookingParam ?? null}
      profile={{
        email: 'preview@stryvsociety.test',
        fullName: 'Mobile Preview',
        phone: '',
      }}
      showAccountActions={false}
    />
  );
}
