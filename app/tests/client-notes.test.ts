import { describe, expect, test } from 'bun:test';
import {
  ClientNoteValidationError,
  buildClientNotePublishPayload,
  clientNoteVisibleToClient,
  normalizeClientNoteInput,
  type ClientNote,
} from '../src/lib/clientNotes';

const clientId = '4e01f1f7-5043-4ad1-9866-e1f484aae2ab';
const appUser = { id: clientId, email: 'nia@example.com' };

describe('client note utilities', () => {
  test('normalizes draft trainer notes for saved or email-targeted clients', () => {
    const note = normalizeClientNoteInput({
      clientId,
      clientEmail: ' NIA@EXAMPLE.COM ',
      clientName: ' Nia McCain ',
      title: ' Form cues ',
      body: ' Keep rib cage down on presses. ',
      pinned: true,
      attachments: [{ name: 'Push press review', url: 'https://example.com/video', type: 'video/mp4' }],
    });

    expect(note).toMatchObject({
      clientId,
      clientEmail: 'nia@example.com',
      clientName: 'Nia McCain',
      title: 'Form cues',
      body: 'Keep rib cage down on presses.',
      pinned: true,
      status: 'draft',
      publish: false,
    });
    expect(note.attachments).toEqual([{ name: 'Push press review', url: 'https://example.com/video', type: 'video/mp4' }]);
  });

  test('publishing forces published status', () => {
    const note = normalizeClientNoteInput({
      clientEmail: 'dangel@example.com',
      title: 'Meal timing',
      body: 'Move the higher-carb meal closer to training.',
      status: 'draft',
      publish: true,
    });

    expect(note.status).toBe('published');
  });

  test('rejects notes without target or body', () => {
    expect(() => normalizeClientNoteInput({ title: 'No client', body: 'Missing target' })).toThrow(
      ClientNoteValidationError
    );
    expect(() => normalizeClientNoteInput({ clientEmail: 'nia@example.com', title: 'Empty', body: '  ' })).toThrow(
      ClientNoteValidationError
    );
  });

  test('filters client-visible notes to published notes for the signed-in client', () => {
    expect(clientNoteVisibleToClient(clientNote({ status: 'published' }), appUser)).toBe(true);
    expect(clientNoteVisibleToClient(clientNote({ status: 'draft' }), appUser)).toBe(false);
    expect(clientNoteVisibleToClient(clientNote({ appUserId: null, clientEmail: 'NIA@EXAMPLE.COM' }), appUser)).toBe(true);
    expect(clientNoteVisibleToClient(clientNote({ appUserId: null, clientEmail: 'other@example.com' }), appUser)).toBe(false);
  });

  test('builds a publish payload without admin-only fields', () => {
    const payload = buildClientNotePublishPayload(clientNote({ pinned: true }));

    expect(payload).toMatchObject({
      noteId: 'note-1',
      title: 'Form cues',
      body: 'Keep rib cage down on presses.',
      pinned: true,
    });
    expect(payload).not.toHaveProperty('createdByEmail');
  });
});

function clientNote(overrides: Partial<ClientNote> = {}): ClientNote {
  return {
    id: overrides.id ?? 'note-1',
    appUserId: overrides.appUserId === undefined ? clientId : overrides.appUserId,
    clientEmail: overrides.clientEmail === undefined ? 'nia@example.com' : overrides.clientEmail,
    clientName: overrides.clientName ?? 'Nia McCain',
    title: overrides.title ?? 'Form cues',
    body: overrides.body ?? 'Keep rib cage down on presses.',
    attachments: overrides.attachments ?? [],
    pinned: overrides.pinned ?? false,
    status: overrides.status ?? 'published',
    publishedRecordId: overrides.publishedRecordId ?? null,
    createdByUserId: overrides.createdByUserId ?? 'admin-1',
    createdByEmail: overrides.createdByEmail ?? 'coach@stryvsocietyfit.com',
    publishedAt: overrides.publishedAt ?? '2026-06-12T21:25:00.000Z',
    createdAt: overrides.createdAt ?? '2026-06-12T21:25:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-12T21:25:00.000Z',
  };
}
