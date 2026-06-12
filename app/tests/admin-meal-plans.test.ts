import { describe, expect, test } from 'bun:test';
import {
  AdminMealPlanValidationError,
  buildMealPlanPublishPayload,
  normalizeAdminMealPlanInput,
  type AdminMealPlan,
} from '../src/lib/adminMealPlans';

const clientId = '4e01f1f7-5043-4ad1-9866-e1f484aae2ab';

describe('admin meal plan utilities', () => {
  test('normalizes a client-targeted meal plan draft', () => {
    const mealPlan = normalizeAdminMealPlanInput({
      clientId,
      clientEmail: ' NIA@EXAMPLE.COM ',
      clientName: ' Nia McCain ',
      title: ' Week 3 meal plan ',
      workoutFocus: ' strength ',
      meals: [
        {
          id: 'meal-1',
          name: ' Chicken bowl ',
          subtitle: 'High protein',
          price_cents: 1299,
          calories: 520,
          protein_g: 44,
          carbs_g: 48,
          fat_g: 16,
          product_url: 'https://idealnutritionnow.com/chicken',
          image_url: 'https://example.com/chicken.jpg',
          tags: [' lean ', 'high protein'],
        },
      ],
    });

    expect(mealPlan).toMatchObject({
      clientId,
      clientEmail: 'nia@example.com',
      clientName: 'Nia McCain',
      title: 'Week 3 meal plan',
      workoutFocus: 'strength',
      status: 'draft',
      publish: false,
    });
    expect(mealPlan.totals).toEqual({ costCents: 1299, calories: 520, proteinG: 44, carbsG: 48, fatG: 16 });
    expect(mealPlan.meals[0]).toMatchObject({ name: 'Chicken bowl', priceCents: 1299, proteinG: 44 });
  });

  test('publishing forces published status and accepts explicit totals', () => {
    const mealPlan = normalizeAdminMealPlanInput({
      clientEmail: 'dangel@example.com',
      title: 'Performance carbs',
      publish: true,
      meals: [meal({ id: 'meal-1', protein_g: 30 })],
      totals: { costCents: 2400, calories: 1100, proteinG: 80, carbsG: 130, fatG: 34 },
    });

    expect(mealPlan.status).toBe('published');
    expect(mealPlan.summary).toContain('80g protein');
    expect(mealPlan.totals.proteinG).toBe(80);
  });

  test('rejects plans without a client target or meals', () => {
    expect(() =>
      normalizeAdminMealPlanInput({
        title: 'No client',
        meals: [meal()],
      })
    ).toThrow(AdminMealPlanValidationError);
    expect(() =>
      normalizeAdminMealPlanInput({
        clientEmail: 'nia@example.com',
        title: 'No meals',
        meals: [],
      })
    ).toThrow(AdminMealPlanValidationError);
  });

  test('builds a client publish payload without admin-only fields', () => {
    const payload = buildMealPlanPublishPayload(adminMealPlan());

    expect(payload).toMatchObject({
      mealPlanId: 'meal-plan-1',
      workoutFocus: 'strength',
      totals: { costCents: 1299, calories: 520, proteinG: 44, carbsG: 48, fatG: 16 },
    });
    expect(payload).not.toHaveProperty('createdByEmail');
    expect(payload).not.toHaveProperty('clientEmail');
  });
});

function meal(overrides: Record<string, unknown> = {}) {
  return {
    id: overrides.id ?? 'meal-1',
    name: overrides.name ?? 'Chicken bowl',
    subtitle: overrides.subtitle ?? 'High protein',
    price_cents: overrides.price_cents ?? 1299,
    calories: overrides.calories ?? 520,
    protein_g: overrides.protein_g ?? 44,
    carbs_g: overrides.carbs_g ?? 48,
    fat_g: overrides.fat_g ?? 16,
    product_url: overrides.product_url ?? 'https://idealnutritionnow.com/chicken',
    image_url: overrides.image_url ?? null,
    tags: overrides.tags ?? ['high protein'],
  };
}

function adminMealPlan(overrides: Partial<AdminMealPlan> = {}): AdminMealPlan {
  return {
    id: overrides.id ?? 'meal-plan-1',
    clientId: overrides.clientId === undefined ? clientId : overrides.clientId,
    clientEmail: overrides.clientEmail === undefined ? 'nia@example.com' : overrides.clientEmail,
    clientName: overrides.clientName ?? 'Nia McCain',
    title: overrides.title ?? 'Week 3 meal plan',
    summary: overrides.summary ?? 'Client-ready meal plan',
    workoutFocus: overrides.workoutFocus ?? 'strength',
    meals: overrides.meals ?? [
      {
        id: 'meal-1',
        name: 'Chicken bowl',
        subtitle: 'High protein',
        priceCents: 1299,
        calories: 520,
        proteinG: 44,
        carbsG: 48,
        fatG: 16,
        productUrl: 'https://idealnutritionnow.com/chicken',
        imageUrl: null,
        tags: ['high protein'],
      },
    ],
    totals: overrides.totals ?? { costCents: 1299, calories: 520, proteinG: 44, carbsG: 48, fatG: 16 },
    brief: overrides.brief ?? 'Eat meal 1 before training.',
    status: overrides.status ?? 'published',
    publishedRecordId: overrides.publishedRecordId ?? 'publish-1',
    createdByUserId: overrides.createdByUserId ?? 'admin-1',
    createdByEmail: overrides.createdByEmail ?? 'coach@stryvsocietyfit.com',
    publishedAt: overrides.publishedAt ?? '2026-06-12T21:35:00.000Z',
    createdAt: overrides.createdAt ?? '2026-06-12T21:35:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-12T21:35:00.000Z',
  };
}
