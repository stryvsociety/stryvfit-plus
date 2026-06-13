import { AppShell } from '@/components/layout/AppShell';
import { Card } from '@/components/ui/Card';
import { requireFirstSessionBooked } from '@/lib/auth';
import { listClientNotes, type ClientNote } from '@/lib/clientNotes';

export const dynamic = 'force-dynamic';

function formatNoteDate(note: ClientNote): string {
  const date = new Date(note.publishedAt ?? note.updatedAt ?? note.createdAt);
  if (Number.isNaN(date.getTime())) return 'Recent update';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(date);
}

export default async function NotesPage() {
  const appUser = await requireFirstSessionBooked();
  let notes: ClientNote[] = [];
  let loadError: string | null = null;

  try {
    notes = await listClientNotes(appUser, 30);
  } catch {
    loadError = 'Trainer notes are unavailable right now. Please check back shortly.';
  }

  return (
    <AppShell>
      <header className="mb-6">
        <h1 className="font-section text-3xl tracking-normal">TRAINER NOTES</h1>
        <p className="font-body text-sm text-text-muted mt-1">
          Programming, form cues, and check-ins from your coach.
        </p>
      </header>
      <div className="space-y-3">
        {loadError ? (
          <Card>
            <p className="font-body text-sm text-text-muted">{loadError}</p>
          </Card>
        ) : notes.length === 0 ? (
          <Card>
            <p className="font-caption text-[11px] uppercase tracking-[0.16em] text-text-dim">No notes yet</p>
            <p className="font-body text-sm text-text-muted mt-2">
              Your coach has not posted a trainer note for this profile yet.
            </p>
          </Card>
        ) : (
          notes.map((note) => (
            <Card key={note.id} className={note.pinned ? 'border-gold/60' : ''}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-caption text-[11px] uppercase tracking-[0.16em] text-text-dim">
                    {note.pinned ? 'Pinned note' : 'Trainer note'}
                  </p>
                  <h2 className="mt-2 font-section text-2xl tracking-normal text-text">{note.title}</h2>
                </div>
                <time className="font-caption text-[11px] uppercase tracking-[0.16em] text-text-dim">
                  {formatNoteDate(note)}
                </time>
              </div>
              <p className="mt-3 whitespace-pre-line font-body text-sm leading-relaxed text-text-muted">{note.body}</p>
              {note.attachments.length > 0 ? (
                <div className="mt-4 space-y-2">
                  {note.attachments.map((attachment) => (
                    <a
                      key={`${note.id}:${attachment.url}`}
                      href={attachment.url}
                      target="_blank"
                      rel="noreferrer"
                      className="block font-body text-sm text-gold underline"
                    >
                      {attachment.name}
                    </a>
                  ))}
                </div>
              ) : null}
            </Card>
          ))
        )}
      </div>
    </AppShell>
  );
}
