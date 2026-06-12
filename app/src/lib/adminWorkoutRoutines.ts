import type { AppUser } from '@/lib/auth';
import { createAdminPublishRecord, type AdminPublishRecord } from '@/lib/adminPublish';
import { serviceClient } from '@/lib/supabase';

export const ADMIN_WORKOUT_ROUTINE_STATUSES = ['draft', 'published', 'archived'] as const;
export type AdminWorkoutRoutineStatus = (typeof ADMIN_WORKOUT_ROUTINE_STATUSES)[number];

export const WGER_SYNC_STATUSES = ['not_requested', 'not_configured', 'pending', 'synced', 'failed'] as const;
export type WgerSyncStatus = (typeof WGER_SYNC_STATUSES)[number];

export type AdminWorkoutBlock = {
  name: string;
  detail: string;
  order: number;
};

export type AdminWorkoutExercise = {
  id: number | null;
  name: string;
  category: string | null;
  source: string | null;
};

export type TrainingWeekItem = {
  day: string;
  focus: string;
  load: string | null;
  status: string | null;
};

export type CreateAdminWorkoutRoutineInput = {
  clientId?: unknown;
  clientEmail?: unknown;
  clientName?: unknown;
  title?: unknown;
  summary?: unknown;
  blocks?: unknown;
  selectedExercises?: unknown;
  trainingWeek?: unknown;
  status?: unknown;
  publish?: unknown;
  syncToWger?: unknown;
};

export type NormalizedAdminWorkoutRoutineInput = {
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  title: string;
  summary: string;
  blocks: AdminWorkoutBlock[];
  selectedExercises: AdminWorkoutExercise[];
  trainingWeek: TrainingWeekItem[];
  status: AdminWorkoutRoutineStatus;
  publish: boolean;
  syncToWger: boolean;
};

export type AdminWorkoutRoutine = {
  id: string;
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  title: string;
  summary: string;
  blocks: AdminWorkoutBlock[];
  selectedExercises: AdminWorkoutExercise[];
  trainingWeek: TrainingWeekItem[];
  status: AdminWorkoutRoutineStatus;
  publishedRecordId: string | null;
  wgerSyncRequested: boolean;
  wgerSyncStatus: WgerSyncStatus;
  wgerRoutineId: string | null;
  wgerSyncError: string | null;
  createdByUserId: string | null;
  createdByEmail: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminWorkoutRoutineRow = {
  id: string;
  client_id: string | null;
  client_email: string | null;
  client_name: string | null;
  title: string;
  summary: string;
  blocks: AdminWorkoutBlock[];
  selected_exercises: AdminWorkoutExercise[];
  training_week: TrainingWeekItem[];
  status: AdminWorkoutRoutineStatus;
  published_record_id: string | null;
  wger_sync_requested: boolean;
  wger_sync_status: WgerSyncStatus;
  wger_routine_id: string | null;
  wger_sync_error: string | null;
  created_by_user_id: string | null;
  created_by_email: string | null;
  created_at: string;
  updated_at: string;
};

type AppUserClientRow = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
};

export type CreateAdminWorkoutRoutineResult = {
  routine: AdminWorkoutRoutine;
  publishedRecord: AdminPublishRecord | null;
};

const WORKOUT_ROUTINE_SELECT =
  'id, client_id, client_email, client_name, title, summary, blocks, selected_exercises, training_week, status, published_record_id, wger_sync_requested, wger_sync_status, wger_routine_id, wger_sync_error, created_by_user_id, created_by_email, created_at, updated_at';
const APP_USER_CLIENT_SELECT = 'id, email, full_name, role';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AdminWorkoutRoutineValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminWorkoutRoutineValidationError';
  }
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeEmail(value: unknown): string | null {
  const email = trimmedString(value).toLowerCase();
  if (!email) return null;
  if (!EMAIL_RE.test(email)) throw new AdminWorkoutRoutineValidationError('Enter a valid client email.');
  return email;
}

function normalizeClientId(value: unknown, hasClientEmail: boolean): string | null {
  const clientId = trimmedString(value);
  if (!clientId) return null;
  if (!UUID_RE.test(clientId) && hasClientEmail) return null;
  if (!UUID_RE.test(clientId)) {
    throw new AdminWorkoutRoutineValidationError('Choose a saved client profile or include the client email.');
  }
  return clientId;
}

function normalizeStatus(value: unknown, publish: boolean): AdminWorkoutRoutineStatus {
  if (publish) return 'published';
  if (value === undefined || value === null || value === '') return 'draft';
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new AdminWorkoutRoutineValidationError('Workout routine status must be draft, published, or archived.');
}

function normalizeLimit(limit = 30): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function normalizeWorkoutBlocks(value: unknown): AdminWorkoutBlock[] {
  if (!Array.isArray(value)) throw new AdminWorkoutRoutineValidationError('Add at least one workout block.');

  const blocks = value
    .map((item, index): AdminWorkoutBlock | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = trimmedString(record.name);
      const detail = trimmedString(record.detail);
      const order = Number(record.order);
      if (!name && !detail) return null;
      return {
        name: name || `Block ${index + 1}`,
        detail,
        order: Number.isFinite(order) ? Math.trunc(order) : index,
      };
    })
    .filter((item): item is AdminWorkoutBlock => Boolean(item))
    .sort((a, b) => a.order - b.order);

  if (blocks.length === 0) throw new AdminWorkoutRoutineValidationError('Add at least one workout block.');
  return blocks;
}

function normalizeSelectedExercises(value: unknown): AdminWorkoutExercise[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AdminWorkoutRoutineValidationError('Selected exercises must be a list.');

  return value
    .map((item): AdminWorkoutExercise | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const name = trimmedString(record.name);
      if (!name) return null;
      const id = Number(record.id);
      return {
        id: Number.isFinite(id) ? Math.trunc(id) : null,
        name,
        category: trimmedString(record.category) || null,
        source: trimmedString(record.source) || null,
      };
    })
    .filter((item): item is AdminWorkoutExercise => Boolean(item));
}

function normalizeTrainingWeek(value: unknown): TrainingWeekItem[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AdminWorkoutRoutineValidationError('Training week must be a list.');

  return value
    .map((item): TrainingWeekItem | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const day = trimmedString(record.day);
      const focus = trimmedString(record.focus);
      if (!day && !focus) return null;
      return {
        day: day || 'Day',
        focus: focus || 'Training',
        load: trimmedString(record.load) || null,
        status: trimmedString(record.status) || null,
      };
    })
    .filter((item): item is TrainingWeekItem => Boolean(item));
}

function wgerSyncStatus(syncToWger: boolean): WgerSyncStatus {
  if (!syncToWger) return 'not_requested';
  if (!process.env.WGER_API_BASE_URL || !process.env.WGER_API_TOKEN) return 'not_configured';
  return 'pending';
}

export function normalizeAdminWorkoutRoutineInput(
  input: CreateAdminWorkoutRoutineInput
): NormalizedAdminWorkoutRoutineInput {
  const clientEmail = normalizeEmail(input.clientEmail);
  const clientId = normalizeClientId(input.clientId, Boolean(clientEmail));
  const clientName = trimmedString(input.clientName) || null;
  const title = trimmedString(input.title);
  const blocks = normalizeWorkoutBlocks(input.blocks);
  const selectedExercises = normalizeSelectedExercises(input.selectedExercises);
  const trainingWeek = normalizeTrainingWeek(input.trainingWeek);
  const publish = input.publish === true;
  const syncToWger = input.syncToWger === true;
  const summary =
    trimmedString(input.summary) ||
    blocks
      .map((block) => `${block.name}: ${block.detail}`)
      .join(' ')
      .slice(0, 1000);

  if (!clientId && !clientEmail) throw new AdminWorkoutRoutineValidationError('Choose a client for this routine.');
  if (!title) throw new AdminWorkoutRoutineValidationError('Add a workout routine title.');
  if (!summary) throw new AdminWorkoutRoutineValidationError('Add workout routine details before saving.');

  return {
    clientId,
    clientEmail,
    clientName,
    title,
    summary,
    blocks,
    selectedExercises,
    trainingWeek,
    status: normalizeStatus(input.status, publish),
    publish,
    syncToWger,
  };
}

export function buildWorkoutRoutinePublishPayload(routine: AdminWorkoutRoutine): Record<string, unknown> {
  return {
    routineId: routine.id,
    blocks: routine.blocks,
    selectedExercises: routine.selectedExercises,
    trainingWeek: routine.trainingWeek,
    wger: {
      syncRequested: routine.wgerSyncRequested,
      syncStatus: routine.wgerSyncStatus,
      routineId: routine.wgerRoutineId,
      syncError: routine.wgerSyncError,
    },
  };
}

function toAdminWorkoutRoutine(row: AdminWorkoutRoutineRow): AdminWorkoutRoutine {
  return {
    id: row.id,
    clientId: row.client_id,
    clientEmail: row.client_email,
    clientName: row.client_name,
    title: row.title,
    summary: row.summary,
    blocks: row.blocks,
    selectedExercises: row.selected_exercises,
    trainingWeek: row.training_week,
    status: row.status,
    publishedRecordId: row.published_record_id,
    wgerSyncRequested: row.wger_sync_requested,
    wgerSyncStatus: row.wger_sync_status,
    wgerRoutineId: row.wger_routine_id,
    wgerSyncError: row.wger_sync_error,
    createdByUserId: row.created_by_user_id,
    createdByEmail: row.created_by_email,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveClientTarget(input: NormalizedAdminWorkoutRoutineInput): Promise<{
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
    throw new AdminWorkoutRoutineValidationError('Only client profiles can receive workout routines.');
  }

  return {
    clientId: client.id,
    clientEmail: client.email,
    clientName: input.clientName ?? client.full_name ?? client.email,
  };
}

export async function createAdminWorkoutRoutine(
  input: CreateAdminWorkoutRoutineInput,
  admin: Pick<AppUser, 'id' | 'email'>
): Promise<CreateAdminWorkoutRoutineResult> {
  const normalized = normalizeAdminWorkoutRoutineInput(input);
  const target = await resolveClientTarget(normalized);
  const syncStatus = wgerSyncStatus(normalized.syncToWger);

  const inserted = await serviceClient()
    .from('admin_workout_routines')
    .insert({
      client_id: target.clientId,
      client_email: target.clientEmail,
      client_name: target.clientName,
      title: normalized.title,
      summary: normalized.summary,
      blocks: normalized.blocks,
      selected_exercises: normalized.selectedExercises,
      training_week: normalized.trainingWeek,
      status: normalized.status,
      wger_sync_requested: normalized.syncToWger,
      wger_sync_status: syncStatus,
      wger_sync_error:
        syncStatus === 'not_configured'
          ? 'Set WGER_API_BASE_URL and WGER_API_TOKEN before syncing private routines to wger.'
          : null,
      created_by_user_id: admin.id,
      created_by_email: admin.email,
    })
    .select(WORKOUT_ROUTINE_SELECT)
    .single();

  if (inserted.error) throw inserted.error;
  let routine = toAdminWorkoutRoutine(inserted.data as AdminWorkoutRoutineRow);
  let publishedRecord: AdminPublishRecord | null = null;

  if (normalized.publish) {
    publishedRecord = await createAdminPublishRecord(
      {
        clientId: routine.clientId,
        clientEmail: routine.clientEmail,
        clientName: routine.clientName,
        surface: 'workout_plan',
        title: routine.title,
        summary: routine.summary,
        payload: buildWorkoutRoutinePublishPayload(routine),
      },
      admin
    );

    const updated = await serviceClient()
      .from('admin_workout_routines')
      .update({ published_record_id: publishedRecord.id, status: 'published' })
      .eq('id', routine.id)
      .select(WORKOUT_ROUTINE_SELECT)
      .single();

    if (updated.error) throw updated.error;
    routine = toAdminWorkoutRoutine(updated.data as AdminWorkoutRoutineRow);
  }

  return { routine, publishedRecord };
}

export async function listAdminWorkoutRoutines(limit = 30): Promise<AdminWorkoutRoutine[]> {
  const { data, error } = await serviceClient()
    .from('admin_workout_routines')
    .select(WORKOUT_ROUTINE_SELECT)
    .order('updated_at', { ascending: false })
    .limit(normalizeLimit(limit));

  if (error) throw error;
  return ((data ?? []) as AdminWorkoutRoutineRow[]).map(toAdminWorkoutRoutine);
}

export async function listClientWorkoutRoutines(
  appUser: Pick<AppUser, 'id' | 'email'>,
  limit = 30
): Promise<AdminWorkoutRoutine[]> {
  const email = appUser.email.trim().toLowerCase();
  const cappedLimit = normalizeLimit(limit);
  const sb = serviceClient();
  const [byClientId, byClientEmail] = await Promise.all([
    sb
      .from('admin_workout_routines')
      .select(WORKOUT_ROUTINE_SELECT)
      .eq('status', 'published')
      .eq('client_id', appUser.id)
      .order('updated_at', { ascending: false })
      .limit(cappedLimit),
    sb
      .from('admin_workout_routines')
      .select(WORKOUT_ROUTINE_SELECT)
      .eq('status', 'published')
      .eq('client_email', email)
      .order('updated_at', { ascending: false })
      .limit(cappedLimit),
  ]);

  if (byClientId.error) throw byClientId.error;
  if (byClientEmail.error) throw byClientEmail.error;

  const byId = new Map<string, AdminWorkoutRoutine>();
  const rows = [...((byClientId.data ?? []) as AdminWorkoutRoutineRow[]), ...((byClientEmail.data ?? []) as AdminWorkoutRoutineRow[])];
  for (const row of rows) {
    const routine = toAdminWorkoutRoutine(row);
    byId.set(routine.id, routine);
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, cappedLimit);
}
