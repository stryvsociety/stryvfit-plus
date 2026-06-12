import { describe, expect, test } from 'bun:test';
import {
  AdminWorkoutRoutineValidationError,
  buildWorkoutRoutinePublishPayload,
  normalizeAdminWorkoutRoutineInput,
  type AdminWorkoutRoutine,
} from '../src/lib/adminWorkoutRoutines';

const clientId = '4e01f1f7-5043-4ad1-9866-e1f484aae2ab';

describe('admin workout routine utilities', () => {
  test('normalizes a client-targeted workout routine draft', () => {
    const routine = normalizeAdminWorkoutRoutineInput({
      clientId,
      clientEmail: ' NIA@EXAMPLE.COM ',
      clientName: ' Nia McCain ',
      title: ' Lower strength A ',
      blocks: [
        { name: ' Main lift ', detail: ' Back squat 5x3 ', order: 2 },
        { name: ' Warmup ', detail: ' Hip flow ', order: 1 },
      ],
      selectedExercises: [{ id: 123, name: ' Back Squat ', category: 'Legs', source: 'wger' }],
      trainingWeek: [{ day: 'Mon', focus: 'Lower strength', load: 'Heavy', status: 'Ready' }],
    });

    expect(routine).toMatchObject({
      clientId,
      clientEmail: 'nia@example.com',
      clientName: 'Nia McCain',
      title: 'Lower strength A',
      status: 'draft',
      publish: false,
      syncToWger: false,
    });
    expect(routine.blocks.map((block) => block.name)).toEqual(['Warmup', 'Main lift']);
    expect(routine.selectedExercises[0]).toEqual({ id: 123, name: 'Back Squat', category: 'Legs', source: 'wger' });
  });

  test('publishing forces published status and builds a summary from blocks', () => {
    const routine = normalizeAdminWorkoutRoutineInput({
      clientEmail: 'dangel@example.com',
      title: 'Remote hotel session',
      publish: true,
      syncToWger: true,
      blocks: [{ name: 'Circuit', detail: 'Split squat, band row, incline push-up' }],
    });

    expect(routine.status).toBe('published');
    expect(routine.summary).toContain('Circuit: Split squat');
    expect(routine.syncToWger).toBe(true);
  });

  test('rejects routines without a concrete client target', () => {
    expect(() =>
      normalizeAdminWorkoutRoutineInput({
        title: 'Upper volume',
        blocks: [{ name: 'Press', detail: 'Bench press 4x6' }],
      })
    ).toThrow(AdminWorkoutRoutineValidationError);
  });

  test('builds the client publish payload without leaking admin-only fields', () => {
    const payload = buildWorkoutRoutinePublishPayload(workoutRoutine({ wgerSyncStatus: 'not_configured' }));

    expect(payload).toMatchObject({
      routineId: 'routine-1',
      blocks: [{ name: 'Warmup', detail: 'Hip flow', order: 0 }],
      selectedExercises: [{ id: 123, name: 'Back Squat', category: 'Legs', source: 'wger' }],
      wger: {
        syncRequested: true,
        syncStatus: 'not_configured',
        routineId: null,
      },
    });
    expect(payload).not.toHaveProperty('createdByEmail');
  });
});

function workoutRoutine(overrides: Partial<AdminWorkoutRoutine> = {}): AdminWorkoutRoutine {
  return {
    id: overrides.id ?? 'routine-1',
    clientId: overrides.clientId === undefined ? clientId : overrides.clientId,
    clientEmail: overrides.clientEmail === undefined ? 'nia@example.com' : overrides.clientEmail,
    clientName: overrides.clientName ?? 'Nia McCain',
    title: overrides.title ?? 'Lower strength A',
    summary: overrides.summary ?? 'Client-ready lower strength plan',
    blocks: overrides.blocks ?? [{ name: 'Warmup', detail: 'Hip flow', order: 0 }],
    selectedExercises: overrides.selectedExercises ?? [{ id: 123, name: 'Back Squat', category: 'Legs', source: 'wger' }],
    trainingWeek: overrides.trainingWeek ?? [{ day: 'Mon', focus: 'Lower strength', load: 'Heavy', status: 'Ready' }],
    status: overrides.status ?? 'published',
    publishedRecordId: overrides.publishedRecordId ?? 'publish-1',
    wgerSyncRequested: overrides.wgerSyncRequested ?? true,
    wgerSyncStatus: overrides.wgerSyncStatus ?? 'pending',
    wgerRoutineId: overrides.wgerRoutineId ?? null,
    wgerSyncError: overrides.wgerSyncError ?? null,
    createdByUserId: overrides.createdByUserId ?? 'admin-1',
    createdByEmail: overrides.createdByEmail ?? 'coach@stryvsocietyfit.com',
    createdAt: overrides.createdAt ?? '2026-06-12T21:00:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-12T21:00:00.000Z',
  };
}
