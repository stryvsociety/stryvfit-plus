import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { CoachCTA } from '@/components/settings/CoachCTA';
import { requireFirstSessionBooked } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

type TrainerContact = {
  phone: string | null;
  name: string;
};

async function getTrainerContact(): Promise<TrainerContact> {
  try {
    const sb = serviceClient();
    const { data } = await sb.from('app_settings').select('trainer_phone, trainer_name').eq('id', 1).single();
    return {
      phone: (data?.trainer_phone as string | null) ?? null,
      name: (data?.trainer_name as string | null) ?? 'Ashley',
    };
  } catch {
    return { phone: null, name: 'Ashley' };
  }
}

export default async function CoachPage() {
  await requireFirstSessionBooked();
  const trainer = await getTrainerContact();
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-section text-3xl tracking-normal">YOUR COACH</h1>
        <p className="font-body text-sm text-text-muted mt-1">
          Direct line to {trainer.name} via iMessage. Replies during business hours.
        </p>
      </header>
      <Card>
        <CoachCTA phone={trainer.phone} trainerName={trainer.name} />
      </Card>
    </AppShell>
  );
}
