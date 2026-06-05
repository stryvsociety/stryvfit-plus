import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { requireFirstSessionBooked } from '@/lib/auth';

export default async function NotesPage() {
  await requireFirstSessionBooked();
  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-section text-3xl tracking-normal">TRAINER NOTES</h1>
        <p className="font-body text-sm text-text-muted mt-1">
          Programming, form cues, and check-ins from your coach.
        </p>
      </header>
      <div className="space-y-3">
        <Card>
          <p className="font-caption text-[11px] uppercase tracking-[0.16em] text-text-dim">
            Awaiting realtime wiring
          </p>
          <p className="font-body text-sm text-text-muted mt-2">
            Notes will stream in here once Supabase realtime + RLS is configured.
          </p>
        </Card>
      </div>
    </AppShell>
  );
}
