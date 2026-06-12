import type { AppUser } from '@/lib/auth';
import { createAdminPublishRecord, type AdminPublishRecord } from '@/lib/adminPublish';
import { serviceClient } from '@/lib/supabase';

export const ADMIN_MEAL_PLAN_STATUSES = ['draft', 'published', 'archived'] as const;
export type AdminMealPlanStatus = (typeof ADMIN_MEAL_PLAN_STATUSES)[number];

export type AdminMealPlanMeal = {
  id: string;
  name: string;
  subtitle: string | null;
  priceCents: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  productUrl: string | null;
  imageUrl: string | null;
  tags: string[];
};

export type AdminMealPlanTotals = {
  costCents: number;
  calories: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
};

export type CreateAdminMealPlanInput = {
  clientId?: unknown;
  clientEmail?: unknown;
  clientName?: unknown;
  title?: unknown;
  summary?: unknown;
  workoutFocus?: unknown;
  meals?: unknown;
  totals?: unknown;
  brief?: unknown;
  status?: unknown;
  publish?: unknown;
};

export type NormalizedAdminMealPlanInput = {
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  title: string;
  summary: string;
  workoutFocus: string | null;
  meals: AdminMealPlanMeal[];
  totals: AdminMealPlanTotals;
  brief: string | null;
  status: AdminMealPlanStatus;
  publish: boolean;
};

export type AdminMealPlan = {
  id: string;
  clientId: string | null;
  clientEmail: string | null;
  clientName: string | null;
  title: string;
  summary: string;
  workoutFocus: string | null;
  meals: AdminMealPlanMeal[];
  totals: AdminMealPlanTotals;
  brief: string | null;
  status: AdminMealPlanStatus;
  publishedRecordId: string | null;
  createdByUserId: string | null;
  createdByEmail: string | null;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type AdminMealPlanRow = {
  id: string;
  client_id: string | null;
  client_email: string | null;
  client_name: string | null;
  title: string;
  summary: string;
  workout_focus: string | null;
  meals: AdminMealPlanMeal[];
  totals: AdminMealPlanTotals;
  brief: string | null;
  status: AdminMealPlanStatus;
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

export type CreateAdminMealPlanResult = {
  mealPlan: AdminMealPlan;
  publishedRecord: AdminPublishRecord | null;
};

const ADMIN_MEAL_PLAN_SELECT =
  'id, client_id, client_email, client_name, title, summary, workout_focus, meals, totals, brief, status, published_record_id, created_by_user_id, created_by_email, published_at, created_at, updated_at';
const APP_USER_CLIENT_SELECT = 'id, email, full_name, role';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export class AdminMealPlanValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AdminMealPlanValidationError';
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
  if (!EMAIL_RE.test(email)) throw new AdminMealPlanValidationError('Enter a valid client email.');
  return email;
}

function normalizeClientId(value: unknown, hasClientEmail: boolean): string | null {
  const clientId = trimmedString(value);
  if (!clientId) return null;
  if (!UUID_RE.test(clientId) && hasClientEmail) return null;
  if (!UUID_RE.test(clientId)) {
    throw new AdminMealPlanValidationError('Choose a saved client profile or include the client email.');
  }
  return clientId;
}

function normalizeStatus(value: unknown, publish: boolean): AdminMealPlanStatus {
  if (publish) return 'published';
  if (value === undefined || value === null || value === '') return 'draft';
  if (value === 'draft' || value === 'published' || value === 'archived') return value;
  throw new AdminMealPlanValidationError('Meal plan status must be draft, published, or archived.');
}

function numberValue(record: Record<string, unknown>, ...keys: string[]): number {
  for (const key of keys) {
    const value = Number(record[key]);
    if (Number.isFinite(value)) return Math.max(Math.trunc(value), 0);
  }
  return 0;
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(trimmedString).filter(Boolean).slice(0, 20);
}

function normalizeMeals(value: unknown): AdminMealPlanMeal[] {
  if (!Array.isArray(value)) throw new AdminMealPlanValidationError('Add at least one meal to the plan.');

  const meals = value
    .map((item): AdminMealPlanMeal | null => {
      if (!item || typeof item !== 'object') return null;
      const record = item as Record<string, unknown>;
      const id = trimmedString(record.id);
      const name = trimmedString(record.name);
      if (!id || !name) return null;

      return {
        id,
        name,
        subtitle: trimmedString(record.subtitle) || null,
        priceCents: numberValue(record, 'priceCents', 'price_cents'),
        calories: numberValue(record, 'calories'),
        proteinG: numberValue(record, 'proteinG', 'protein_g'),
        carbsG: numberValue(record, 'carbsG', 'carbs_g'),
        fatG: numberValue(record, 'fatG', 'fat_g'),
        productUrl: trimmedString(record.productUrl) || trimmedString(record.product_url) || null,
        imageUrl: trimmedString(record.imageUrl) || trimmedString(record.image_url) || null,
        tags: stringArray(record.tags),
      };
    })
    .filter((meal): meal is AdminMealPlanMeal => Boolean(meal))
    .slice(0, 20);

  if (meals.length === 0) throw new AdminMealPlanValidationError('Add at least one meal to the plan.');
  return meals;
}

function totalsFromMeals(meals: AdminMealPlanMeal[]): AdminMealPlanTotals {
  return meals.reduce(
    (totals, meal) => ({
      costCents: totals.costCents + meal.priceCents,
      calories: totals.calories + meal.calories,
      proteinG: totals.proteinG + meal.proteinG,
      carbsG: totals.carbsG + meal.carbsG,
      fatG: totals.fatG + meal.fatG,
    }),
    { costCents: 0, calories: 0, proteinG: 0, carbsG: 0, fatG: 0 }
  );
}

function normalizeTotals(value: unknown, meals: AdminMealPlanMeal[]): AdminMealPlanTotals {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return totalsFromMeals(meals);
  const record = value as Record<string, unknown>;
  return {
    costCents: numberValue(record, 'costCents', 'cost', 'price_cents'),
    calories: numberValue(record, 'calories'),
    proteinG: numberValue(record, 'proteinG', 'protein'),
    carbsG: numberValue(record, 'carbsG', 'carbs'),
    fatG: numberValue(record, 'fatG', 'fat'),
  };
}

export function normalizeAdminMealPlanInput(input: CreateAdminMealPlanInput): NormalizedAdminMealPlanInput {
  const clientEmail = normalizeEmail(input.clientEmail);
  const clientId = normalizeClientId(input.clientId, Boolean(clientEmail));
  const clientName = trimmedString(input.clientName) || null;
  const title = trimmedString(input.title);
  const meals = normalizeMeals(input.meals);
  const totals = normalizeTotals(input.totals, meals);
  const workoutFocus = trimmedString(input.workoutFocus) || null;
  const publish = input.publish === true;
  const summary =
    trimmedString(input.summary) ||
    `${meals.length} Ideal Nutrition meals, ${totals.proteinG}g protein, ${totals.calories} calories.`;

  if (!clientId && !clientEmail) throw new AdminMealPlanValidationError('Choose a client for this meal plan.');
  if (!title) throw new AdminMealPlanValidationError('Add a meal plan title.');
  if (!summary) throw new AdminMealPlanValidationError('Add meal plan details before saving.');

  return {
    clientId,
    clientEmail,
    clientName,
    title,
    summary,
    workoutFocus,
    meals,
    totals,
    brief: trimmedString(input.brief) || null,
    status: normalizeStatus(input.status, publish),
    publish,
  };
}

export function buildMealPlanPublishPayload(mealPlan: AdminMealPlan): Record<string, unknown> {
  return {
    mealPlanId: mealPlan.id,
    workoutFocus: mealPlan.workoutFocus,
    meals: mealPlan.meals,
    totals: mealPlan.totals,
    brief: mealPlan.brief,
  };
}

function toAdminMealPlan(row: AdminMealPlanRow): AdminMealPlan {
  return {
    id: row.id,
    clientId: row.client_id,
    clientEmail: row.client_email,
    clientName: row.client_name,
    title: row.title,
    summary: row.summary,
    workoutFocus: row.workout_focus,
    meals: row.meals,
    totals: row.totals,
    brief: row.brief,
    status: row.status,
    publishedRecordId: row.published_record_id,
    createdByUserId: row.created_by_user_id,
    createdByEmail: row.created_by_email,
    publishedAt: row.published_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function resolveClientTarget(input: NormalizedAdminMealPlanInput): Promise<{
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
  if (client.role !== 'client') throw new AdminMealPlanValidationError('Only client profiles can receive meal plans.');

  return {
    clientId: client.id,
    clientEmail: client.email,
    clientName: input.clientName ?? client.full_name ?? client.email,
  };
}

export async function createAdminMealPlan(
  input: CreateAdminMealPlanInput,
  admin: Pick<AppUser, 'id' | 'email'>
): Promise<CreateAdminMealPlanResult> {
  const normalized = normalizeAdminMealPlanInput(input);
  const target = await resolveClientTarget(normalized);
  const publishedAt = normalized.status === 'published' ? new Date().toISOString() : null;

  const inserted = await serviceClient()
    .from('admin_meal_plans')
    .insert({
      client_id: target.clientId,
      client_email: target.clientEmail,
      client_name: target.clientName,
      title: normalized.title,
      summary: normalized.summary,
      workout_focus: normalized.workoutFocus,
      meals: normalized.meals,
      totals: normalized.totals,
      brief: normalized.brief,
      status: normalized.status,
      created_by_user_id: admin.id,
      created_by_email: admin.email,
      published_at: publishedAt,
    })
    .select(ADMIN_MEAL_PLAN_SELECT)
    .single();

  if (inserted.error) throw inserted.error;
  let mealPlan = toAdminMealPlan(inserted.data as AdminMealPlanRow);
  let publishedRecord: AdminPublishRecord | null = null;

  if (normalized.publish) {
    publishedRecord = await createAdminPublishRecord(
      {
        clientId: mealPlan.clientId,
        clientEmail: mealPlan.clientEmail,
        clientName: mealPlan.clientName,
        surface: 'meal_plan',
        title: mealPlan.title,
        summary: mealPlan.summary,
        payload: buildMealPlanPublishPayload(mealPlan),
      },
      admin
    );

    const updated = await serviceClient()
      .from('admin_meal_plans')
      .update({
        published_record_id: publishedRecord.id,
        status: 'published',
        published_at: publishedAt ?? new Date().toISOString(),
      })
      .eq('id', mealPlan.id)
      .select(ADMIN_MEAL_PLAN_SELECT)
      .single();

    if (updated.error) throw updated.error;
    mealPlan = toAdminMealPlan(updated.data as AdminMealPlanRow);
  }

  return { mealPlan, publishedRecord };
}

export async function listAdminMealPlans({
  limit = 50,
  status,
}: {
  limit?: number;
  status?: unknown;
} = {}): Promise<AdminMealPlan[]> {
  const cappedLimit = normalizeLimit(limit);
  let query = serviceClient()
    .from('admin_meal_plans')
    .select(ADMIN_MEAL_PLAN_SELECT)
    .order('updated_at', { ascending: false })
    .limit(cappedLimit);

  if (status) query = query.eq('status', normalizeStatus(status, false));

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as AdminMealPlanRow[]).map(toAdminMealPlan);
}

export async function listClientMealPlans(
  appUser: Pick<AppUser, 'id' | 'email'>,
  limit = 30
): Promise<AdminMealPlan[]> {
  const email = appUser.email.trim().toLowerCase();
  const cappedLimit = normalizeLimit(limit);
  const sb = serviceClient();
  const [byClientId, byClientEmail] = await Promise.all([
    sb
      .from('admin_meal_plans')
      .select(ADMIN_MEAL_PLAN_SELECT)
      .eq('status', 'published')
      .eq('client_id', appUser.id)
      .order('updated_at', { ascending: false })
      .limit(cappedLimit),
    sb
      .from('admin_meal_plans')
      .select(ADMIN_MEAL_PLAN_SELECT)
      .eq('status', 'published')
      .eq('client_email', email)
      .order('updated_at', { ascending: false })
      .limit(cappedLimit),
  ]);

  if (byClientId.error) throw byClientId.error;
  if (byClientEmail.error) throw byClientEmail.error;

  const byId = new Map<string, AdminMealPlan>();
  const rows = [...((byClientId.data ?? []) as AdminMealPlanRow[]), ...((byClientEmail.data ?? []) as AdminMealPlanRow[])];
  for (const row of rows) {
    const mealPlan = toAdminMealPlan(row);
    byId.set(mealPlan.id, mealPlan);
  }

  return [...byId.values()]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, cappedLimit);
}
