import type { AppUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';

export const CLIENT_REQUEST_KINDS = ['trainer-note'] as const;
export type StoredClientRequestKind = (typeof CLIENT_REQUEST_KINDS)[number];

export const CLIENT_REQUEST_STATUSES = ['new', 'reviewed', 'archived'] as const;
export type StoredClientRequestStatus = (typeof CLIENT_REQUEST_STATUSES)[number];

export type CreateStoredClientRequestInput = {
  kind?: unknown;
  clientName?: unknown;
  message?: unknown;
};

export type NormalizedStoredClientRequestInput = {
  kind: StoredClientRequestKind;
  clientName: string | null;
  message: string;
  suggestedActions: string[];
};

export type StoredClientRequest = {
  id: string;
  appUserId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  kind: StoredClientRequestKind;
  message: string;
  suggestedActions: string[];
  status: StoredClientRequestStatus;
  reviewedByUserId: string | null;
  reviewedByEmail: string | null;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type ClientRequestRow = {
  id: string;
  app_user_id: string | null;
  client_email: string | null;
  client_name: string | null;
  kind: string;
  message: string;
  suggested_actions: string[];
  status: StoredClientRequestStatus;
  reviewed_by_user_id: string | null;
  reviewed_by_email: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
};

export class ClientRequestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ClientRequestValidationError';
  }
}

const CLIENT_REQUEST_SELECT =
  'id, app_user_id, client_email, client_name, kind, message, suggested_actions, status, reviewed_by_user_id, reviewed_by_email, reviewed_at, created_at, updated_at';

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(limit = 30): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function normalizeKind(value: unknown): StoredClientRequestKind {
  if (value === 'trainer-note') return value;
  throw new ClientRequestValidationError('Choose a valid client request type.');
}

function normalizeStatus(value: unknown): StoredClientRequestStatus {
  if (value === 'new' || value === 'reviewed' || value === 'archived') return value;
  throw new ClientRequestValidationError('Client request status must be new, reviewed, or archived.');
}

export function suggestedClientRequestActions(): string[] {
  return ['Review note before the next check-in.'];
}

export function normalizeStoredClientRequestInput(
  input: CreateStoredClientRequestInput,
  appUser?: Pick<AppUser, 'email' | 'full_name'>
): NormalizedStoredClientRequestInput {
  const kind = normalizeKind(input.kind);
  const message = trimmedString(input.message);
  const clientName = trimmedString(input.clientName) || appUser?.full_name?.trim() || appUser?.email || null;

  if (!message) throw new ClientRequestValidationError('Add a message before sending this request.');

  return {
    kind,
    clientName,
    message,
    suggestedActions: suggestedClientRequestActions(),
  };
}

function toStoredClientRequest(row: ClientRequestRow): StoredClientRequest | null {
  if (row.kind !== 'trainer-note') return null;

  return {
    id: row.id,
    appUserId: row.app_user_id,
    clientEmail: row.client_email,
    clientName: row.client_name,
    kind: 'trainer-note',
    message: row.message,
    suggestedActions: row.suggested_actions,
    status: row.status,
    reviewedByUserId: row.reviewed_by_user_id,
    reviewedByEmail: row.reviewed_by_email,
    reviewedAt: row.reviewed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function clientRequestVisibleToClient(
  request: Pick<StoredClientRequest, 'appUserId' | 'clientEmail'>,
  appUser: Pick<AppUser, 'id' | 'email'>
): boolean {
  if (request.appUserId && request.appUserId === appUser.id) return true;
  return request.clientEmail?.trim().toLowerCase() === appUser.email.trim().toLowerCase();
}

export async function createStoredClientRequest(
  input: CreateStoredClientRequestInput,
  appUser: Pick<AppUser, 'id' | 'email' | 'full_name'>
): Promise<StoredClientRequest> {
  const normalized = normalizeStoredClientRequestInput(input, appUser);
  const { data, error } = await serviceClient()
    .from('client_requests')
    .insert({
      app_user_id: appUser.id,
      client_email: appUser.email.trim().toLowerCase(),
      client_name: normalized.clientName,
      kind: normalized.kind,
      message: normalized.message,
      suggested_actions: normalized.suggestedActions,
      status: 'new',
    })
    .select(CLIENT_REQUEST_SELECT)
    .single();

  if (error) throw error;
  const request = toStoredClientRequest(data as ClientRequestRow);
  if (!request) throw new ClientRequestValidationError('This request type is no longer available.');
  return request;
}

export async function listClientRequests(
  appUser: Pick<AppUser, 'id' | 'email'>,
  limit = 30
): Promise<StoredClientRequest[]> {
  const email = appUser.email.trim().toLowerCase();
  const cappedLimit = normalizeLimit(limit);
  const sb = serviceClient();
  const [byUserId, byEmail] = await Promise.all([
    sb
      .from('client_requests')
      .select(CLIENT_REQUEST_SELECT)
      .eq('app_user_id', appUser.id)
      .order('created_at', { ascending: false })
      .limit(cappedLimit),
    sb
      .from('client_requests')
      .select(CLIENT_REQUEST_SELECT)
      .eq('client_email', email)
      .order('created_at', { ascending: false })
      .limit(cappedLimit),
  ]);

  if (byUserId.error) throw byUserId.error;
  if (byEmail.error) throw byEmail.error;

  const byId = new Map<string, StoredClientRequest>();
  const rows = [...((byUserId.data ?? []) as ClientRequestRow[]), ...((byEmail.data ?? []) as ClientRequestRow[])];
  for (const row of rows) {
    const request = toStoredClientRequest(row);
    if (request && clientRequestVisibleToClient(request, appUser)) byId.set(request.id, request);
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, cappedLimit);
}

export async function listAdminClientRequests({
  limit = 50,
  status,
}: {
  limit?: number;
  status?: unknown;
} = {}): Promise<StoredClientRequest[]> {
  const cappedLimit = normalizeLimit(limit);
  let query = serviceClient()
    .from('client_requests')
    .select(CLIENT_REQUEST_SELECT)
    .order('created_at', { ascending: false })
    .limit(cappedLimit);

  if (status) query = query.eq('status', normalizeStatus(status));

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ClientRequestRow[])
    .map(toStoredClientRequest)
    .filter((request): request is StoredClientRequest => Boolean(request));
}

export async function updateClientRequestStatus(
  requestId: unknown,
  status: unknown,
  admin: Pick<AppUser, 'id' | 'email'>
): Promise<StoredClientRequest> {
  const id = trimmedString(requestId);
  if (!id) throw new ClientRequestValidationError('Client request id is required.');

  const nextStatus = normalizeStatus(status);
  const reviewed = nextStatus === 'reviewed' || nextStatus === 'archived';
  const { data, error } = await serviceClient()
    .from('client_requests')
    .update({
      status: nextStatus,
      reviewed_by_user_id: reviewed ? admin.id : null,
      reviewed_by_email: reviewed ? admin.email : null,
      reviewed_at: reviewed ? new Date().toISOString() : null,
    })
    .eq('id', id)
    .eq('kind', 'trainer-note')
    .select(CLIENT_REQUEST_SELECT)
    .maybeSingle();

  if (error) throw error;
  const request = data ? toStoredClientRequest(data as ClientRequestRow) : null;
  if (!request) throw new ClientRequestValidationError('This request type is no longer available.');
  return request;
}
