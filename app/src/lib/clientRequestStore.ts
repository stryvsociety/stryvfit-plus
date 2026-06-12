import type { AppUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';

export const CLIENT_REQUEST_KINDS = ['trainer-note', 'meal-plan-change'] as const;
export type StoredClientRequestKind = (typeof CLIENT_REQUEST_KINDS)[number];

export const CLIENT_REQUEST_STATUSES = ['new', 'reviewed', 'archived'] as const;
export type StoredClientRequestStatus = (typeof CLIENT_REQUEST_STATUSES)[number];

export type ClientRequestMeal = {
  id: string;
  name: string;
  protein_g: number | null;
  calories: number | null;
  product_url: string | null;
};

export type CreateStoredClientRequestInput = {
  kind?: unknown;
  clientName?: unknown;
  message?: unknown;
  meals?: unknown;
};

export type NormalizedStoredClientRequestInput = {
  kind: StoredClientRequestKind;
  clientName: string | null;
  message: string;
  meals: ClientRequestMeal[];
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
  meals: ClientRequestMeal[];
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
  kind: StoredClientRequestKind;
  message: string;
  suggested_actions: string[];
  meals: ClientRequestMeal[];
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
  'id, app_user_id, client_email, client_name, kind, message, suggested_actions, meals, status, reviewed_by_user_id, reviewed_by_email, reviewed_at, created_at, updated_at';

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(limit = 30): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function normalizeKind(value: unknown): StoredClientRequestKind {
  if (value === 'trainer-note' || value === 'meal-plan-change') return value;
  throw new ClientRequestValidationError('Choose a valid client request type.');
}

function normalizeStatus(value: unknown): StoredClientRequestStatus {
  if (value === 'new' || value === 'reviewed' || value === 'archived') return value;
  throw new ClientRequestValidationError('Client request status must be new, reviewed, or archived.');
}

function nullableNumber(value: unknown): number | null {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeMeals(value: unknown): ClientRequestMeal[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ClientRequestValidationError('Client request meals must be a list.');

  return value
    .map((item): ClientRequestMeal | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = trimmedString(record.id);
      const name = trimmedString(record.name);
      if (!id || !name) return null;

      return {
        id,
        name,
        protein_g: nullableNumber(record.protein_g),
        calories: nullableNumber(record.calories),
        product_url: trimmedString(record.product_url) || null,
      };
    })
    .filter((meal): meal is ClientRequestMeal => Boolean(meal))
    .slice(0, 20);
}

export function suggestedClientRequestActions(
  kind: StoredClientRequestKind,
  message: string,
  meals: ClientRequestMeal[]
): string[] {
  const lower = message.toLowerCase();
  const actions = new Set<string>();

  if (kind === 'meal-plan-change') {
    actions.add('Review requested meal swaps against the trainer-approved plan.');
    actions.add('Send one updated 4-meal recommendation set back to the client.');
  } else {
    actions.add('Review note before the next check-in.');
  }

  if (lower.includes('allerg') || lower.includes('dairy') || lower.includes('gluten')) {
    actions.add('Check dietary restriction tags before approving substitutions.');
  }
  if (lower.includes('hungry') || lower.includes('more food') || lower.includes('portion')) {
    actions.add('Rebalance calories or add a trainer-approved flex meal.');
  }
  if (lower.includes('protein')) {
    actions.add('Bias replacements toward higher-protein Ideal Nutrition meals.');
  }
  if (lower.includes('schedule') || lower.includes('time')) {
    actions.add('Confirm meal timing around the next scheduled workout.');
  }
  if (meals.length > 0) {
    actions.add(`Use current ${meals.length}-meal plan as the baseline for the response.`);
  }

  return [...actions].slice(0, 5);
}

export function normalizeStoredClientRequestInput(
  input: CreateStoredClientRequestInput,
  appUser?: Pick<AppUser, 'email' | 'full_name'>
): NormalizedStoredClientRequestInput {
  const kind = normalizeKind(input.kind);
  const message = trimmedString(input.message);
  const meals = normalizeMeals(input.meals);
  const clientName = trimmedString(input.clientName) || appUser?.full_name?.trim() || appUser?.email || null;

  if (!message) throw new ClientRequestValidationError('Add a message before sending this request.');

  return {
    kind,
    clientName,
    message,
    meals,
    suggestedActions: suggestedClientRequestActions(kind, message, meals),
  };
}

function toStoredClientRequest(row: ClientRequestRow): StoredClientRequest {
  return {
    id: row.id,
    appUserId: row.app_user_id,
    clientEmail: row.client_email,
    clientName: row.client_name,
    kind: row.kind,
    message: row.message,
    suggestedActions: row.suggested_actions,
    meals: row.meals,
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
      meals: normalized.meals,
      status: 'new',
    })
    .select(CLIENT_REQUEST_SELECT)
    .single();

  if (error) throw error;
  return toStoredClientRequest(data as ClientRequestRow);
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
    if (clientRequestVisibleToClient(request, appUser)) byId.set(request.id, request);
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
  return ((data ?? []) as ClientRequestRow[]).map(toStoredClientRequest);
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
    .select(CLIENT_REQUEST_SELECT)
    .single();

  if (error) throw error;
  return toStoredClientRequest(data as ClientRequestRow);
}
