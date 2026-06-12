import type { AppUser } from '@/lib/auth';
import { createAdminPublishRecord, type AdminPublishRecord } from '@/lib/adminPublish';
import { serviceClient } from '@/lib/supabase';

export const CLIENT_NOTE_STATUSES = ['draft', 'published', 'archived'] as const;
export type ClientNoteStatus = (typeof CLIENT_NOTE_STATUSES)[number];

export type ClientNoteAttachment = {
  name: string;
  url: string;
  type: string | null;
};

export type CreateClientNoteInput = {
  clientId?: unknown;
  clientEmail?: unknown;
  clientName?: unknown;
  title?: unknown;
  body?: unknown;
  attachments?: unknown;
  pinned?: unknown;
  status?: unknown;
  publish?: unknown;
};

export type NormalizedClientNoteInput = {
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  title: string;
  body: string;
  attachments: ClientNoteAttachment[];
  pinned: boolean;
  status: ClientNoteStatus;
  publish: boolean;
};

export type ClientNote = {
  id: string;
  appUserId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  title: string;
  body: string;
  attachments: ClientNoteAttachment[];
  pinned: boolean;
  status: ClientNoteStatus;
  publishedRecordId: string | null;
  createdByUserId: string | null;
  createdByEmail: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClientNoteRow = {
  id: string;
  app_user_id: string | null;
  client_email: string | null;
  client_name: string | null;
  title: string;
  body: string;
  attachments: ClientNoteAttachment[];
  pinned: boolean;
  status: ClientNoteStatus;
  published_record_id: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  published_at: string | null;
  created_at: string;
  updated_at: string;
};

type AppUserClientRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

export type CreateClientNoteResult = {
  note: ClientNote;
  publishedRecord: AdminPublishRecord | null;
};

export class ClientNoteValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientNoteValidationError';
  }
}

const CLIENT_NOTE_SELECT =
  'id, app_user_id, client_email, client_name, title, body, attachments, pinned, status, published_record_id, created_by_user_id, created_by_email, published_at, created_at, updated_at';
const APP_USER_CLIENT_SELECT = 'id, email, full_name, role';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(limit = 30): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function normalizeEmail(value: unknown): string | null {
  const email = trimmedString(value).toLowerCase();
  if (!email) return null;
  if (!EMAIL_RE.test(email)) throw new ClientNoteValidationError('Enter a valid client email.');
  return email;
}

function normalizeClientId(value: unknown, hasClientEmail: boolean): string | null {
  const clientId = trimmedString(value);
  if (!clientId) return null;
  if (!UUID_RE.test(clientId) && hasClientEmail) return null;
  if (!UUID_RE.test(clientId)) {
    throw new ClientNoteValidationError('Choose a saved client profile or include the client email.');
  }
  return clientId;
}

function normalizeStatus(value: unknown, publish: boolean): ClientNoteStatus {
  if (publish) return 'published';
  if (value === undefined || value === null || value === '') return 'draft';
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new ClientNoteValidationError('Client note status must be draft, published, or archived.');
}

function normalizeAttachments(value: unknown): ClientNoteAttachment[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ClientNoteValidationError('Client note attachments must be a list.');

  return value
    .map((item): ClientNoteAttachment | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = trimmedString(record.name);
      const url = trimmedString(record.url);
      if (!name || !url) return null;

      return {
        name,
        url,
        type: trimmedString(record.type) || null,
      };
    })
    .filter((attachment): attachment is ClientNoteAttachment => Boolean(attachment))
    .slice(0, 20);
}

export function normalizeClientNoteInput(input: CreateClientNoteInput): NormalizedClientNoteInput {
  const clientEmail = normalizeEmail(input.clientEmail);
  const clientId = normalizeClientId(input.clientId, Boolean(clientEmail));
  const clientName = trimmedString(input.clientName) || null;
  const title = trimmedString(input.title);
  const body = trimmedString(input.body);
  const publish = input.publish === true;

  if (!clientId && !clientEmail) throw new ClientNoteValidationError('Choose a client for this note.');
  if (!title) throw new ClientNoteValidationError('Add a note title.');
  if (!body) throw new ClientNoteValidationError('Add note details before saving.');

  return {
    clientId,
    clientEmail,
    clientName,
    title,
    body,
    attachments: normalizeAttachments(input.attachments),
    pinned: input.pinned === true,
    status: normalizeStatus(input.status, publish),
    publish,
  };
}

export function buildClientNotePublishPayload(note: ClientNote): Record<string, unknown> {
  return {
    noteId: note.id,
    title: note.title,
    body: note.body,
    pinned: note.pinned,
    attachments: note.attachments,
  };
}

export function clientNoteVisibleToClient(
  note: Pick<ClientNote, 'appUserId' | 'clientEmail' | 'status'>,
  appUser: Pick<AppUser, 'id' | 'email'>
): boolean {
  if (note.status !== 'published') return false;
  if (note.appUserId && note.appUserId === appUser.id) return true;
  return note.clientEmail?.trim().toLowerCase() === appUser.email.trim().toLowerCase();
}

function toClientNote(row: ClientNoteRow): ClientNote {
  return {
    id: row.id,
    appUserId: row.app_user_id,
    clientEmail: row.client_email,
    clientName: row.client_name,
    title: row.title,
    body: row.body,
    attachments: row.attachments,
    pinned: row.pinned,
    status: row.status,
    publishedRecordId: row.published_record_id,
    createdByUserId: row.created_by_user_id,
    createdByEmail: row.created_by_email,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveClientTarget(input: NormalizedClientNoteInput): Promise<{
  appUserId: string | null;
  clientEmail: string | null;
  clientName: string | null;
}> {
  const sb = serviceClient();
  const query = input.clientId
    ? sb.from('app_users').select(APP_USER_CLIENT_SELECT).eq('id', input.clientId)
    : sb.from('app_users').select(APP_USER_CLIENT_SELECT).eq('email', input.clientEmail);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return { appUserId: input.clientId, clientEmail: input.clientEmail, clientName: input.clientName };

  const client = data as AppUserClientRow;
  if (client.role !== 'client') throw new ClientNoteValidationError('Only client profiles can receive trainer notes.');

  return {
    appUserId: client.id,
    clientEmail: client.email,
    clientName: input.clientName ?? client.full_name ?? client.email,
  };
}

export async function createClientNote(
  input: CreateClientNoteInput,
  admin: Pick<AppUser, 'id' | 'email'>
): Promise<CreateClientNoteResult> {
  const normalized = normalizeClientNoteInput(input);
  const target = await resolveClientTarget(normalized);
  const publishedAt = normalized.status === 'published' ? new Date().toISOString() : null;

  const inserted = await serviceClient()
    .from('client_notes')
    .insert({
      app_user_id: target.appUserId,
      client_email: target.clientEmail,
      client_name: target.clientName,
      title: normalized.title,
      body: normalized.body,
      attachments: normalized.attachments,
      pinned: normalized.pinned,
      status: normalized.status,
      created_by_user_id: admin.id,
      created_by_email: admin.email,
      published_at: publishedAt,
    })
    .select(CLIENT_NOTE_SELECT)
    .single();

  if (inserted.error) throw inserted.error;
  let note = toClientNote(inserted.data as ClientNoteRow);
  let publishedRecord: AdminPublishRecord | null = null;

  if (normalized.publish) {
    publishedRecord = await createAdminPublishRecord(
      {
        clientId: note.appUserId,
        clientEmail: note.clientEmail,
        clientName: note.clientName,
        surface: 'client_note',
        title: note.title,
        summary: note.body,
        payload: buildClientNotePublishPayload(note),
      },
      admin
    );

    const updated = await serviceClient()
      .from('client_notes')
      .update({ published_record_id: publishedRecord.id, status: 'published', published_at: publishedAt ?? new Date().toISOString() })
      .eq('id', note.id)
      .select(CLIENT_NOTE_SELECT)
      .single();

    if (updated.error) throw updated.error;
    note = toClientNote(updated.data as ClientNoteRow);
  }

  return { note, publishedRecord };
}

export async function listAdminClientNotes({
  limit = 50,
  status,
}: {
  limit?: number;
  status?: unknown;
} = {}): Promise<ClientNote[]> {
  const cappedLimit = normalizeLimit(limit);
  let query = serviceClient()
    .from('client_notes')
    .select(CLIENT_NOTE_SELECT)
    .order('pinned', { ascending: false })
    .order('updated_at', { ascending: false })
    .limit(cappedLimit);

  if (status) {
    const nextStatus = normalizeStatus(status, false);
    query = query.eq('status', nextStatus);
  }

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ClientNoteRow[]).map(toClientNote);
}

export async function listClientNotes(appUser: Pick<AppUser, 'id' | 'email'>, limit = 30): Promise<ClientNote[]> {
  const email = appUser.email.trim().toLowerCase();
  const cappedLimit = normalizeLimit(limit);
  const sb = serviceClient();
  const [byUserId, byEmail] = await Promise.all([
    sb
      .from('client_notes')
      .select(CLIENT_NOTE_SELECT)
      .eq('status', 'published')
      .eq('app_user_id', appUser.id)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(cappedLimit),
    sb
      .from('client_notes')
      .select(CLIENT_NOTE_SELECT)
      .eq('status', 'published')
      .eq('client_email', email)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false })
      .limit(cappedLimit),
  ]);

  if (byUserId.error) throw byUserId.error;
  if (byEmail.error) throw byEmail.error;

  const byId = new Map<string, ClientNote>();
  const rows = [...((byUserId.data ?? []) as ClientNoteRow[]), ...((byEmail.data ?? []) as ClientNoteRow[])];
  for (const row of rows) {
    const note = toClientNote(row);
    if (clientNoteVisibleToClient(note, appUser)) byId.set(note.id, note);
  }

  return [...byId.values()]
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, cappedLimit);
}
