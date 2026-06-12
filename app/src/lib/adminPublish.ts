import type { AppUser } from '@/lib/auth';
import { serviceClient } from '@/lib/supabase';

export const ADMIN_PUBLISH_SURFACES = ['workout_plan', 'meal_plan', 'appointment_plan', 'client_note'] as const;
export type AdminPublishSurface = (typeof ADMIN_PUBLISH_SURFACES)[number];

export const ADMIN_PUBLISH_STATUSES = ['draft', 'published'] as const;
export type AdminPublishStatus = (typeof ADMIN_PUBLISH_STATUSES)[number];

export type CreateAdminPublishInput = {
  clientId?: unknown;
  clientEmail?: unknown;
  clientName?: unknown;
  surface?: unknown;
  title?: unknown;
  summary?: unknown;
  payload?: unknown;
  status?: unknown;
};

export type NormalizedAdminPublishInput = {
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  surface: AdminPublishSurface;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  status: AdminPublishStatus;
};

export type AdminPublishRecord = {
  id: string;
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  surface: AdminPublishSurface;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  status: AdminPublishStatus;
  publishedByUserId: string | null;
  publishedByEmail: string | null;
  publishedAt: string;
  createdAt: string;
  updatedAt: string;
};

type ClientPublishTarget = Pick<AppUser, 'id' | 'email'>;

type AdminPublishRow = {
  id: string;
  client_id: string | null;
  client_email: string | null;
  client_name: string | null;
  surface: AdminPublishSurface;
  title: string;
  summary: string;
  payload: Record<string, unknown>;
  status: AdminPublishStatus;
  published_by_user_id: string | null;
  published_by_email: string | null;
  published_at: string;
  created_at: string;
  updated_at: string;
};

type AppUserClientRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

const ADMIN_PUBLISH_SELECT =
  'id, client_id, client_email, client_name, surface, title, summary, payload, status, published_by_user_id, published_by_email, published_at, created_at, updated_at';
const APP_USER_CLIENT_SELECT = 'id, email, full_name, role';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SURFACE_ALIASES: Record<string, AdminPublishSurface> = {
  appointment: 'appointment_plan',
  appointments: 'appointment_plan',
  appointment_plan: 'appointment_plan',
  client_note: 'client_note',
  meal: 'meal_plan',
  meals: 'meal_plan',
  meal_plan: 'meal_plan',
  note: 'client_note',
  nutrition: 'meal_plan',
  workout: 'workout_plan',
  workouts: 'workout_plan',
  workout_plan: 'workout_plan',
};

function normalizeLimit(limit = 30): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

export class AdminPublishValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminPublishValidationError';
  }
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function nullableString(value: unknown): string | null {
  const trimmed = trimmedString(value);
  return trimmed || null;
}

function normalizeEmail(value: unknown): string | null {
  const email = trimmedString(value).toLowerCase();
  if (!email) return null;
  if (!EMAIL_RE.test(email)) {
    throw new AdminPublishValidationError('Enter a valid client email before posting.');
  }
  return email;
}

function normalizeClientId(value: unknown, hasClientEmail: boolean): string | null {
  const clientId = trimmedString(value);
  if (!clientId) return null;
  if (!UUID_RE.test(clientId) && hasClientEmail) return null;
  if (!UUID_RE.test(clientId)) {
    throw new AdminPublishValidationError('Choose a saved client profile or include the client email before posting.');
  }
  return clientId;
}

function normalizeSurface(value: unknown): AdminPublishSurface {
  const key = trimmedString(value).toLowerCase();
  const surface = SURFACE_ALIASES[key];
  if (!surface) {
    throw new AdminPublishValidationError('Choose a publish surface before posting.');
  }
  return surface;
}

function normalizeStatus(value: unknown): AdminPublishStatus {
  if (value === undefined || value === null || value === '') return 'published';
  if (value === 'draft' || value === 'published') return value;
  throw new AdminPublishValidationError('Publish status must be draft or published.');
}

function normalizePayload(value: unknown): Record<string, unknown> {
  if (value === undefined || value === null) return {};
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminPublishValidationError('Publish payload must be an object.');
  }
  return value as Record<string, unknown>;
}

export function normalizeAdminPublishInput(input: CreateAdminPublishInput): NormalizedAdminPublishInput {
  const clientEmail = normalizeEmail(input.clientEmail);
  const clientId = normalizeClientId(input.clientId, Boolean(clientEmail));
  const clientName = nullableString(input.clientName);
  const title = trimmedString(input.title);
  const summary = trimmedString(input.summary);

  if (!clientId && !clientEmail) {
    throw new AdminPublishValidationError('Choose a client before posting.');
  }
  if (!title) {
    throw new AdminPublishValidationError('Add a title before posting to the client.');
  }
  if (!summary) {
    throw new AdminPublishValidationError('Add a summary before posting to the client.');
  }

  return {
    clientId,
    clientEmail,
    clientName,
    surface: normalizeSurface(input.surface),
    title,
    summary,
    payload: normalizePayload(input.payload),
    status: normalizeStatus(input.status),
  };
}

function toAdminPublishRecord(row: AdminPublishRow): AdminPublishRecord {
  return {
    id: row.id,
    clientId: row.client_id,
    clientEmail: row.client_email,
    clientName: row.client_name,
    surface: row.surface,
    title: row.title,
    summary: row.summary,
    payload: row.payload,
    status: row.status,
    publishedByUserId: row.published_by_user_id,
    publishedByEmail: row.published_by_email,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function adminPublishRecordVisibleToClient(
  record: Pick<AdminPublishRecord, 'clientId' | 'clientEmail' | 'status'>,
  appUser: ClientPublishTarget
): boolean {
  if (record.status !== 'published') return false;
  if (record.clientId && record.clientId === appUser.id) return true;

  const recordEmail = record.clientEmail?.trim().toLowerCase();
  return Boolean(recordEmail && recordEmail === appUser.email.trim().toLowerCase());
}

export function mergeClientPublishRecords(
  records: AdminPublishRecord[],
  appUser: ClientPublishTarget,
  limit = 30
): AdminPublishRecord[] {
  const cappedLimit = normalizeLimit(limit);
  const byId = new Map<string, AdminPublishRecord>();

  for (const record of records) {
    if (adminPublishRecordVisibleToClient(record, appUser)) byId.set(record.id, record);
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, cappedLimit);
}

async function resolveClientTarget(input: NormalizedAdminPublishInput): Promise<{
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
}> {
  const sb = serviceClient();
  const query = input.clientId
    ? sb.from('app_users').select(APP_USER_CLIENT_SELECT).eq('id', input.clientId)
    : sb.from('app_users').select(APP_USER_CLIENT_SELECT).eq('email', input.clientEmail);

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  if (!data) return { clientId: input.clientId, clientEmail: input.clientEmail, clientName: input.clientName };

  const client = data as AppUserClientRow;
  if (client.role !== 'client') {
    throw new AdminPublishValidationError('Only client profiles can receive admin posts.');
  }

  return {
    clientId: client.id,
    clientEmail: client.email,
    clientName: input.clientName ?? client.full_name ?? client.email,
  };
}

export async function createAdminPublishRecord(
  input: CreateAdminPublishInput,
  admin: Pick<AppUser, 'id' | 'email'>
): Promise<AdminPublishRecord> {
  const normalized = normalizeAdminPublishInput(input);
  const target = await resolveClientTarget(normalized);

  const { data, error } = await serviceClient()
    .from('admin_publish_records')
    .insert({
      client_id: target.clientId,
      client_email: target.clientEmail,
      client_name: target.clientName,
      surface: normalized.surface,
      title: normalized.title,
      summary: normalized.summary,
      payload: normalized.payload,
      status: normalized.status,
      published_by_user_id: admin.id,
      published_by_email: admin.email,
    })
    .select(ADMIN_PUBLISH_SELECT)
    .single();

  if (error) throw error;
  return toAdminPublishRecord(data as AdminPublishRow);
}

export async function listAdminPublishRecords(limit = 30): Promise<AdminPublishRecord[]> {
  const cappedLimit = normalizeLimit(limit);
  const { data, error } = await serviceClient()
    .from('admin_publish_records')
    .select(ADMIN_PUBLISH_SELECT)
    .order('published_at', { ascending: false })
    .limit(cappedLimit);

  if (error) throw error;
  return ((data ?? []) as AdminPublishRow[]).map(toAdminPublishRecord);
}

export async function listClientPublishRecords(
  appUser: ClientPublishTarget,
  limit = 30
): Promise<AdminPublishRecord[]> {
  const cappedLimit = normalizeLimit(limit);
  const email = appUser.email.trim().toLowerCase();
  const sb = serviceClient();

  const [byClientId, byClientEmail] = await Promise.all([
    sb
      .from('admin_publish_records')
      .select(ADMIN_PUBLISH_SELECT)
      .eq('status', 'published')
      .eq('client_id', appUser.id)
      .order('published_at', { ascending: false })
      .limit(cappedLimit),
    sb
      .from('admin_publish_records')
      .select(ADMIN_PUBLISH_SELECT)
      .eq('status', 'published')
      .eq('client_email', email)
      .order('published_at', { ascending: false })
      .limit(cappedLimit),
  ]);

  if (byClientId.error) throw byClientId.error;
  if (byClientEmail.error) throw byClientEmail.error;

  const rows = [...((byClientId.data ?? []) as AdminPublishRow[]), ...((byClientEmail.data ?? []) as AdminPublishRow[])];
  return mergeClientPublishRecords(rows.map(toAdminPublishRecord), appUser, cappedLimit);
}
