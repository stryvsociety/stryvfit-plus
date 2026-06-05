import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { TrainerPhoneForm } from '@/components/settings/TrainerPhoneForm';
import { serviceClient } from '@/lib/supabase';
import { captureServerIncident } from '@/lib/serverIncidents';
import { requireAdminUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

async function loadSettings() {
  try {
    const sb = serviceClient();
    const { data } = await sb
      .from('app_settings')
      .select('trainer_phone, trainer_name')
      .eq('id', 1)
      .single();
    return {
      trainer_phone: (data?.trainer_phone as string | null) ?? '',
      trainer_name: (data?.trainer_name as string | null) ?? 'Ashley',
    };
  } catch (error) {
    try {
      await captureServerIncident({
        source: 'supabase',
        route: '/admin/settings',
        message: error instanceof Error ? error.message : 'Admin settings Supabase load failed',
        severity: 'medium',
        admin_action: 'Auto-filed from admin settings server load.',
      });
    } catch {}
    return { trainer_phone: '', trainer_name: 'Ashley' };
  }
}

export default async function AdminSettingsPage() {
  await requireAdminUser();
  const settings = await loadSettings();
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-section text-3xl tracking-normal">ADMIN · SETTINGS</h1>
        <p className="font-body text-sm text-text-muted mt-1">
          Configure the trainer-facing details that members see in the app.
        </p>
      </header>
      <Card>
        <TrainerPhoneForm
          initialPhone={settings.trainer_phone}
          initialName={settings.trainer_name}
        />
      </Card>
    </AppShell>
  );
}
