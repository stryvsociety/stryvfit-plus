import { SolvysSupportDashboard } from '@/components/admin/SolvysSupportDashboard';
import { requireAdminUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';
import type { AppUpdateRecord, StoredIncident } from '@/lib/incidents';

export const dynamic = 'force-dynamic';

async function loadSupportData(): Promise<{
  incidents: StoredIncident[];
  updates: AppUpdateRecord[];
  error?: string;
}> {
  try {
    const sb = serviceClient();
    const [incidents, updates] = await Promise.all([
      sb
        .from('support_incidents')
        .select('*')
        .order('last_seen_at', { ascending: false })
        .limit(50),
      sb
        .from('app_update_records')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(10),
    ]);

    if (incidents.error) throw incidents.error;
    if (updates.error) throw updates.error;

    return {
      incidents: (incidents.data ?? []) as StoredIncident[],
      updates: (updates.data ?? []) as AppUpdateRecord[],
    };
  } catch (error) {
    return {
      incidents: [],
      updates: [],
      error: error instanceof Error ? error.message : 'Support incidents unavailable',
    };
  }
}

export default async function SolvysSupportPage() {
  const admin = await requireAdminUser();
  const supportData = await loadSupportData();

  return (
    <SolvysSupportDashboard
      incidents={supportData.incidents}
      updates={supportData.updates}
      loadError={supportData.error}
      adminName={admin.full_name ?? admin.email}
    />
  );
}
