import { describe, expect, test } from 'bun:test';
import {
  AdminAppointmentPlanValidationError,
  buildAppointmentPlanPublishPayload,
  normalizeAdminAppointmentPlanInput,
  type AdminAppointmentPlan,
} from '../src/lib/adminAppointmentPlans';

const clientId = '4e01f1f7-5043-4ad1-9866-e1f484aae2ab';
const bookingId = '6b9f2ac8-5023-4f20-9a73-0f02b4dd5e7c';

describe('admin appointment plan utilities', () => {
  test('normalizes a saved-client appointment plan draft', () => {
    const appointmentPlan = normalizeAdminAppointmentPlanInput({
      clientId,
      clientEmail: ' NIA@EXAMPLE.COM ',
      clientName: ' Nia McCain ',
      bookingId,
      title: ' Prep for strength consult ',
      scheduledAt: '2026-06-15T15:00:00-04:00',
      durationMinutes: '60',
      location: ' Stryv Society Fitness ',
      preparation: [
        'Bring lifting shoes',
        { label: 'Review check-in photos', detail: 'Compare week 2 to week 3', done: true },
      ],
      followUp: { message: 'Send remote warmup notes', tasks: ['Update workout plan'] },
    });

    expect(appointmentPlan).toMatchObject({
      clientId,
      clientEmail: 'nia@example.com',
      clientName: 'Nia McCain',
      bookingId,
      appointmentRef: null,
      title: 'Prep for strength consult',
      scheduledAt: '2026-06-15T19:00:00.000Z',
      durationMinutes: 60,
      location: 'Stryv Society Fitness',
      status: 'draft',
      publish: false,
    });
    expect(appointmentPlan.preparation).toHaveLength(2);
    expect(appointmentPlan.preparation[1]).toMatchObject({ completed: true });
    expect(appointmentPlan.summary).toContain('2 prep items');
  });

  test('publishing forces published status and preserves imported calendar references', () => {
    const appointmentPlan = normalizeAdminAppointmentPlanInput({
      clientEmail: 'dangel@example.com',
      bookingId: 'calendar:google-event-1',
      title: 'Calendar import follow-up',
      summary: 'Client-ready appointment instructions',
      publish: true,
      followUp: 'Text after the session.',
    });

    expect(appointmentPlan.status).toBe('published');
    expect(appointmentPlan.bookingId).toBeNull();
    expect(appointmentPlan.appointmentRef).toBe('calendar:google-event-1');
    expect(appointmentPlan.followUp.message).toBe('Text after the session.');
  });

  test('rejects plans without a client target or valid appointment date', () => {
    expect(() =>
      normalizeAdminAppointmentPlanInput({
        title: 'No client',
      })
    ).toThrow(AdminAppointmentPlanValidationError);
    expect(() =>
      normalizeAdminAppointmentPlanInput({
        clientEmail: 'nia@example.com',
        title: 'Bad date',
        scheduledAt: 'not-a-date',
      })
    ).toThrow(AdminAppointmentPlanValidationError);
  });

  test('builds a client publish payload without admin-only fields', () => {
    const payload = buildAppointmentPlanPublishPayload(adminAppointmentPlan());

    expect(payload).toMatchObject({
      appointmentPlanId: 'appointment-plan-1',
      bookingId,
      scheduledAt: '2026-06-15T19:00:00.000Z',
      durationMinutes: 60,
      location: 'Stryv Society Fitness',
    });
    expect(payload).not.toHaveProperty('createdByEmail');
    expect(payload).not.toHaveProperty('clientEmail');
  });
});

function adminAppointmentPlan(overrides: Partial<AdminAppointmentPlan> = {}): AdminAppointmentPlan {
  return {
    id: overrides.id ?? 'appointment-plan-1',
    clientId: overrides.clientId === undefined ? clientId : overrides.clientId,
    clientEmail: overrides.clientEmail === undefined ? 'nia@example.com' : overrides.clientEmail,
    clientName: overrides.clientName ?? 'Nia McCain',
    bookingId: overrides.bookingId === undefined ? bookingId : overrides.bookingId,
    appointmentRef: overrides.appointmentRef ?? null,
    title: overrides.title ?? 'Prep for strength consult',
    summary: overrides.summary ?? 'Client-ready appointment instructions',
    scheduledAt: overrides.scheduledAt ?? '2026-06-15T19:00:00.000Z',
    durationMinutes: overrides.durationMinutes ?? 60,
    location: overrides.location ?? 'Stryv Society Fitness',
    preparation: overrides.preparation ?? [
      { label: 'Bring lifting shoes', detail: null, completed: false },
      { label: 'Review check-in photos', detail: 'Compare week 2 to week 3', completed: true },
    ],
    followUp: overrides.followUp ?? {
      message: 'Send remote warmup notes',
      checkInAt: null,
      tasks: ['Update workout plan'],
    },
    status: overrides.status ?? 'published',
    publishedRecordId: overrides.publishedRecordId ?? 'publish-1',
    createdByUserId: overrides.createdByUserId ?? 'admin-1',
    createdByEmail: overrides.createdByEmail ?? 'coach@stryvsocietyfit.com',
    publishedAt: overrides.publishedAt ?? '2026-06-12T21:45:00.000Z',
    createdAt: overrides.createdAt ?? '2026-06-12T21:45:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-12T21:45:00.000Z',
  };
}
