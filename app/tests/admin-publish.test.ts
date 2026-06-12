import { describe, expect, test } from 'bun:test';
import {
  AdminPublishValidationError,
  adminPublishRecordVisibleToClient,
  mergeClientPublishRecords,
  normalizeAdminPublishInput,
  type AdminPublishRecord,
  type CreateAdminPublishInput,
} from '../src/lib/adminPublish';

const clientId = '4e01f1f7-5043-4ad1-9866-e1f484aae2ab';

describe('admin publish utilities', () => {
  test('normalizes publish records for a saved client profile', () => {
    const normalized = normalizeAdminPublishInput({
      clientId,
      clientEmail: ' NIA@EXAMPLE.COM ',
      clientName: ' Nia McCain ',
      surface: 'Meals',
      title: ' Week 3 meal plan ',
      summary: ' Higher protein reset ',
      payload: { macros: { protein: 150 } },
    });

    expect(normalized).toEqual({
      clientId,
      clientEmail: 'nia@example.com',
      clientName: 'Nia McCain',
      surface: 'meal_plan',
      title: 'Week 3 meal plan',
      summary: 'Higher protein reset',
      payload: { macros: { protein: 150 } },
      status: 'published',
    });
  });

  test('allows email-targeted posts before a full client account exists', () => {
    const normalized = normalizeAdminPublishInput({
      clientEmail: 'dangel@example.com',
      surface: 'workout',
      title: 'Travel week lift',
      summary: 'Three-day hotel-gym plan',
      status: 'draft',
    });

    expect(normalized).toMatchObject({
      clientId: null,
      clientEmail: 'dangel@example.com',
      surface: 'workout_plan',
      payload: {},
      status: 'draft',
    });
  });

  test('accepts booking-roster ids when the client email is present', () => {
    const normalized = normalizeAdminPublishInput({
      clientId: 'booking:calendar-import',
      clientEmail: 'booked@example.com',
      surface: 'appointment',
      title: 'Schedule notes',
      summary: 'Bring prior lab work and training log',
    });

    expect(normalized.clientId).toBeNull();
    expect(normalized.clientEmail).toBe('booked@example.com');
    expect(normalized.surface).toBe('appointment_plan');
  });

  test('requires a concrete client target', () => {
    expect(() =>
      normalizeAdminPublishInput({
        surface: 'workout',
        title: 'Upper body reset',
        summary: 'Form cues and volume cap',
      })
    ).toThrow(AdminPublishValidationError);
  });

  test('rejects non-object payloads before they reach the database', () => {
    const input: CreateAdminPublishInput = {
      clientEmail: 'nia@example.com',
      surface: 'meal_plan',
      title: 'Meal plan',
      summary: 'Breakfast swap',
      payload: ['not', 'an', 'object'],
    };

    expect(() => normalizeAdminPublishInput(input)).toThrow('Publish payload must be an object.');
  });

  test('filters client delivery records to published posts for that client only', () => {
    const records: AdminPublishRecord[] = [
      publishRecord({ id: 'latest', clientId, status: 'published', publishedAt: '2026-06-12T20:00:00.000Z' }),
      publishRecord({ id: 'draft', clientId, status: 'draft', publishedAt: '2026-06-12T21:00:00.000Z' }),
      publishRecord({
        id: 'email-match',
        clientId: null,
        clientEmail: 'NIA@EXAMPLE.COM',
        status: 'published',
        publishedAt: '2026-06-12T19:00:00.000Z',
      }),
      publishRecord({
        id: 'other-client',
        clientId: '0f5ad63f-5167-4fdb-bb49-31ade0ad1d91',
        clientEmail: 'other@example.com',
        status: 'published',
        publishedAt: '2026-06-12T22:00:00.000Z',
      }),
      publishRecord({ id: 'latest', clientId, status: 'published', publishedAt: '2026-06-12T20:00:00.000Z' }),
    ];

    const visible = mergeClientPublishRecords(records, { id: clientId, email: 'nia@example.com' });

    expect(visible.map((record) => record.id)).toEqual(['latest', 'email-match']);
    expect(adminPublishRecordVisibleToClient(records[1], { id: clientId, email: 'nia@example.com' })).toBe(false);
  });
});

function publishRecord(overrides: Partial<AdminPublishRecord>): AdminPublishRecord {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    clientId: overrides.clientId === undefined ? clientId : overrides.clientId,
    clientEmail: overrides.clientEmail === undefined ? 'nia@example.com' : overrides.clientEmail,
    clientName: overrides.clientName ?? 'Nia McCain',
    surface: overrides.surface ?? 'workout_plan',
    title: overrides.title ?? 'Training plan',
    summary: overrides.summary ?? 'Client-ready training notes',
    payload: overrides.payload ?? {},
    status: overrides.status ?? 'published',
    publishedByUserId: overrides.publishedByUserId ?? null,
    publishedByEmail: overrides.publishedByEmail ?? 'coach@stryvsocietyfit.com',
    publishedAt: overrides.publishedAt ?? '2026-06-12T18:00:00.000Z',
    createdAt: overrides.createdAt ?? '2026-06-12T18:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-12T18:00:00.000Z',
  };
}
