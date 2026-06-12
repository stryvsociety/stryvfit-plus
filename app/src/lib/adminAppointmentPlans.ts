import type { AppUser } from '@/lib/auth';
import { createAdminPublishRecord, type AdminPublishRecord } from '@/lib/adminPublish';
import { serviceClient } from '@/lib/supabase';

export const ADMIN_APPOINTMENT_PLAN_STATUSES = ['draft', 'published', 'archived'] as const;
export type AdminAppointmentPlanStatus = (typeof ADMIN_APPOINTMENT_PLAN_STATUSES)[number];

export type AppointmentPreparationItem = {
  label: string;
  detail: string | null;
  completed: boolean;
};

export type AppointmentFollowUp = {
  message: string | null;
  checkInAt: string | null;
  tasks: string[];
};

export type CreateAdminAppointmentPlanInput = {
  clientId?: unknown;
  clientEmail?: unknown;
  clientName?: unknown;
  bookingId?: unknown;
  appointmentRef?: unknown;
  title?: unknown;
  summary?: unknown;
  scheduledAt?: unknown;
  durationMinutes?: unknown;
  location?: unknown;
  preparation?: unknown;
  followUp?: unknown;
  status?: unknown;
  publish?: unknown;
};

export type NormalizedAdminAppointmentPlanInput = {
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  bookingId: string | null;
  appointmentRef: string | null;
  title: string;
  summary: string;
  scheduledAt: string | null;
  durationMinutes: number | null;
  location: string | null;
  preparation: AppointmentPreparationItem[];
  followUp: AppointmentFollowUp;
  status: AdminAppointmentPlanStatus;
  publish: boolean;
};

export type AdminAppointmentPlan = {
  id: string;
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  bookingId: string | null;
  appointmentRef: string | null;
  title: string;
  summary: string;
  scheduledAt: string | null;
  durationMinutes: number | null;
  location: string | null;
  preparation: AppointmentPreparationItem[];
  followUp: AppointmentFollowUp;
  status: AdminAppointmentPlanStatus;
  publishedRecordId: string | null;
  createdByUserId: string | null;
  createdByEmail: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminAppointmentPlanRow = {
  id: string;
  client_id: string | null;
  client_email: string | null;
  client_name: string | null;
  booking_id: string | null;
  appointment_ref: string | null;
  title: string;
  summary: string;
  scheduled_at: string | null;
  duration_minutes: number | null;
  location: string | null;
  preparation: AppointmentPreparationItem[];
  follow_up: AppointmentFollowUp;
  status: AdminAppointmentPlanStatus;
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

export type CreateAdminAppointmentPlanResult = {
  appointmentPlan: AdminAppointmentPlan;
  publishedRecord: AdminPublishRecord | null;
};

const ADMIN_APPOINTMENT_PLAN_SELECT =
  'id, client_id, client_email, client_name, booking_id, appointment_ref, title, summary, scheduled_at, duration_minutes, location, preparation, follow_up, status, published_record_id, created_by_user_id, created_by_email, published_at, created_at, updated_at';
const APP_USER_CLIENT_SELECT = 'id, email, full_name, role';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AdminAppointmentPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminAppointmentPlanValidationError';
  }
}

function trimmedString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLimit(limit = 30): number {
  return Math.min(Math.max(Math.trunc(limit), 1), 100);
}

function normalizeEmail(value: unknown): string | null {
  const email = trimmedString(value).toLowerCase();
  if (!email) return null;
  if (!EMAIL_RE.test(email)) throw new AdminAppointmentPlanValidationError('Enter a valid client email.');
  return email;
}

function normalizeClientId(value: unknown, hasClientEmail: boolean): string | null {
  const clientId = trimmedString(value);
  if (!clientId) return null;
  if (!UUID_RE.test(clientId) && hasClientEmail) return null;
  if (!UUID_RE.test(clientId)) {
    throw new AdminAppointmentPlanValidationError('Choose a saved client profile or include the client email.');
  }
  return clientId;
}

function normalizeBookingReference(input: Pick<CreateAdminAppointmentPlanInput, 'bookingId' | 'appointmentRef'>): {
  bookingId: string | null;
  appointmentRef: string | null;
} {
  const rawBookingId = trimmedString(input.bookingId);
  const rawAppointmentRef = trimmedString(input.appointmentRef);
  let bookingId: string | null = null;
  let appointmentRef: string | null = rawAppointmentRef || null;

  if (rawBookingId) {
    if (UUID_RE.test(rawBookingId)) {
      bookingId = rawBookingId;
    } else if (!appointmentRef) {
      appointmentRef = rawBookingId;
    }
  }

  return { bookingId, appointmentRef };
}

function normalizeStatus(value: unknown, publish: boolean): AdminAppointmentPlanStatus {
  if (publish) return 'published';
  if (value === undefined || value === null || value === '') return 'draft';
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new AdminAppointmentPlanValidationError('Appointment plan status must be draft, published, or archived.');
}

function normalizeScheduledAt(value: unknown): string | null {
  const raw = trimmedString(value);
  if (!raw) return null;
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) {
    throw new AdminAppointmentPlanValidationError('Appointment date is invalid.');
  }
  return date.toISOString();
}

function normalizeDurationMinutes(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const duration = Number(value);
  if (!Number.isFinite(duration) || duration <= 0 || duration > 480) {
    throw new AdminAppointmentPlanValidationError('Appointment duration must be between 1 and 480 minutes.');
  }
  return Math.trunc(duration);
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(trimmedString).filter(Boolean).slice(0, 20);
}

function normalizePreparation(value: unknown): AppointmentPreparationItem[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new AdminAppointmentPlanValidationError('Appointment preparation must be a list.');

  return value
    .map((item): AppointmentPreparationItem | null => {
      if (typeof item === 'string') {
        const label = item.trim();
        return label ? { label, detail: null, completed: false } : null;
      }
      if (!item || typeof item !== 'object') return null;

      const record = item as Record<string, unknown>;
      const label = trimmedString(record.label) || trimmedString(record.title) || trimmedString(record.name);
      const detail = trimmedString(record.detail) || trimmedString(record.notes) || null;
      if (!label && !detail) return null;

      return {
        label: label || 'Preparation',
        detail,
        completed: record.completed === true || record.done === true,
      };
    })
    .filter((item): item is AppointmentPreparationItem => Boolean(item))
    .slice(0, 20);
}

function normalizeFollowUp(value: unknown): AppointmentFollowUp {
  if (value === undefined || value === null || value === '') {
    return { message: null, checkInAt: null, tasks: [] };
  }
  if (typeof value === 'string') {
    return { message: value.trim() || null, checkInAt: null, tasks: [] };
  }
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new AdminAppointmentPlanValidationError('Appointment follow-up must be an object.');
  }

  const record = value as Record<string, unknown>;
  const checkInAt = normalizeScheduledAt(record.checkInAt ?? record.check_in_at);
  return {
    message: trimmedString(record.message) || trimmedString(record.note) || null,
    checkInAt,
    tasks: normalizeStringArray(record.tasks),
  };
}

function buildDefaultSummary(input: {
  title: string;
  scheduledAt: string | null;
  preparation: AppointmentPreparationItem[];
  followUp: AppointmentFollowUp;
}): string {
  const parts = [input.title];
  if (input.scheduledAt) parts.push(`scheduled for ${input.scheduledAt}`);
  if (input.preparation.length > 0) parts.push(`${input.preparation.length} prep item${input.preparation.length === 1 ? '' : 's'}`);
  if (input.followUp.message || input.followUp.tasks.length > 0) parts.push('follow-up included');
  return parts.join(' - ');
}

export function normalizeAdminAppointmentPlanInput(
  input: CreateAdminAppointmentPlanInput
): NormalizedAdminAppointmentPlanInput {
  const clientEmail = normalizeEmail(input.clientEmail);
  const clientId = normalizeClientId(input.clientId, Boolean(clientEmail));
  const clientName = trimmedString(input.clientName) || null;
  const { bookingId, appointmentRef } = normalizeBookingReference(input);
  const title = trimmedString(input.title);
  const scheduledAt = normalizeScheduledAt(input.scheduledAt);
  const durationMinutes = normalizeDurationMinutes(input.durationMinutes);
  const preparation = normalizePreparation(input.preparation);
  const followUp = normalizeFollowUp(input.followUp);
  const publish = input.publish === true;
  const summary =
    trimmedString(input.summary) ||
    buildDefaultSummary({
      title,
      scheduledAt,
      preparation,
      followUp,
    });

  if (!clientId && !clientEmail) throw new AdminAppointmentPlanValidationError('Choose a client for this appointment plan.');
  if (!title) throw new AdminAppointmentPlanValidationError('Add an appointment plan title.');
  if (!summary) throw new AdminAppointmentPlanValidationError('Add appointment plan details before saving.');

  return {
    clientId,
    clientEmail,
    clientName,
    bookingId,
    appointmentRef,
    title,
    summary,
    scheduledAt,
    durationMinutes,
    location: trimmedString(input.location) || null,
    preparation,
    followUp,
    status: normalizeStatus(input.status, publish),
    publish,
  };
}

export function buildAppointmentPlanPublishPayload(appointmentPlan: AdminAppointmentPlan): Record<string, unknown> {
  return {
    appointmentPlanId: appointmentPlan.id,
    bookingId: appointmentPlan.bookingId,
    appointmentRef: appointmentPlan.appointmentRef,
    scheduledAt: appointmentPlan.scheduledAt,
    durationMinutes: appointmentPlan.durationMinutes,
    location: appointmentPlan.location,
    preparation: appointmentPlan.preparation,
    followUp: appointmentPlan.followUp,
  };
}

function toAdminAppointmentPlan(row: AdminAppointmentPlanRow): AdminAppointmentPlan {
  return {
    id: row.id,
    clientId: row.client_id,
    clientEmail: row.client_email,
    clientName: row.client_name,
    bookingId: row.booking_id,
    appointmentRef: row.appointment_ref,
    title: row.title,
    summary: row.summary,
    scheduledAt: row.scheduled_at,
    durationMinutes: row.duration_minutes,
    location: row.location,
    preparation: row.preparation,
    followUp: row.follow_up,
    status: row.status,
    publishedRecordId: row.published_record_id,
    createdByUserId: row.created_by_user_id,
    createdByEmail: row.created_by_email,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveClientTarget(input: NormalizedAdminAppointmentPlanInput): Promise<{
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
    throw new AdminAppointmentPlanValidationError('Only client profiles can receive appointment plans.');
  }

  return {
    clientId: client.id,
    clientEmail: client.email,
    clientName: input.clientName ?? client.full_name ?? client.email,
  };
}

export async function createAdminAppointmentPlan(
  input: CreateAdminAppointmentPlanInput,
  admin: Pick<AppUser, 'id' | 'email'>
): Promise<CreateAdminAppointmentPlanResult> {
  const normalized = normalizeAdminAppointmentPlanInput(input);
  const target = await resolveClientTarget(normalized);
  const publishedAt = normalized.status === 'published' ? new Date().toISOString() : null;

  const inserted = await serviceClient()
    .from('admin_appointment_plans')
    .insert({
      client_id: target.clientId,
      client_email: target.clientEmail,
      client_name: target.clientName,
      booking_id: normalized.bookingId,
      appointment_ref: normalized.appointmentRef,
      title: normalized.title,
      summary: normalized.summary,
      scheduled_at: normalized.scheduledAt,
      duration_minutes: normalized.durationMinutes,
      location: normalized.location,
      preparation: normalized.preparation,
      follow_up: normalized.followUp,
      status: normalized.status,
      created_by_user_id: admin.id,
      created_by_email: admin.email,
      published_at: publishedAt,
    })
    .select(ADMIN_APPOINTMENT_PLAN_SELECT)
    .single();

  if (inserted.error) throw inserted.error;
  let appointmentPlan = toAdminAppointmentPlan(inserted.data as AdminAppointmentPlanRow);
  let publishedRecord: AdminPublishRecord | null = null;

  if (normalized.publish) {
    publishedRecord = await createAdminPublishRecord(
      {
        clientId: appointmentPlan.clientId,
        clientEmail: appointmentPlan.clientEmail,
        clientName: appointmentPlan.clientName,
        surface: 'appointment_plan',
        title: appointmentPlan.title,
        summary: appointmentPlan.summary,
        payload: buildAppointmentPlanPublishPayload(appointmentPlan),
      },
      admin
    );

    const updated = await serviceClient()
      .from('admin_appointment_plans')
      .update({
        published_record_id: publishedRecord.id,
        status: 'published',
        published_at: publishedAt ?? new Date().toISOString(),
      })
      .eq('id', appointmentPlan.id)
      .select(ADMIN_APPOINTMENT_PLAN_SELECT)
      .single();

    if (updated.error) throw updated.error;
    appointmentPlan = toAdminAppointmentPlan(updated.data as AdminAppointmentPlanRow);
  }

  return { appointmentPlan, publishedRecord };
}

export async function listAdminAppointmentPlans({
  limit = 50,
  status,
}: {
  limit?: number;
  status?: unknown;
} = {}): Promise<AdminAppointmentPlan[]> {
  const cappedLimit = normalizeLimit(limit);
  let query = serviceClient()
    .from('admin_appointment_plans')
    .select(ADMIN_APPOINTMENT_PLAN_SELECT)
    .order('updated_at', { ascending: false })
    .limit(cappedLimit);

  if (status) query = query.eq('status', normalizeStatus(status, false));

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as AdminAppointmentPlanRow[]).map(toAdminAppointmentPlan);
}

export async function listClientAppointmentPlans(
  appUser: Pick<AppUser, 'id' | 'email'>,
  limit = 30
): Promise<AdminAppointmentPlan[]> {
  const email = appUser.email.trim().toLowerCase();
  const cappedLimit = normalizeLimit(limit);
  const sb = serviceClient();
  const [byClientId, byClientEmail] = await Promise.all([
    sb
      .from('admin_appointment_plans')
      .select(ADMIN_APPOINTMENT_PLAN_SELECT)
      .eq('status', 'published')
      .eq('client_id', appUser.id)
      .order('updated_at', { ascending: false })
      .limit(cappedLimit),
    sb
      .from('admin_appointment_plans')
      .select(ADMIN_APPOINTMENT_PLAN_SELECT)
      .eq('status', 'published')
      .eq('client_email', email)
      .order('updated_at', { ascending: false })
      .limit(cappedLimit),
  ]);

  if (byClientId.error) throw byClientId.error;
  if (byClientEmail.error) throw byClientEmail.error;

  const byId = new Map<string, AdminAppointmentPlan>();
  const rows = [
    ...((byClientId.data ?? []) as AdminAppointmentPlanRow[]),
    ...((byClientEmail.data ?? []) as AdminAppointmentPlanRow[]),
  ];
  for (const row of rows) {
    const appointmentPlan = toAdminAppointmentPlan(row);
    byId.set(appointmentPlan.id, appointmentPlan);
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, cappedLimit);
}
