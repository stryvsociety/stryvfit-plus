import { describe, expect, test } from 'bun:test';
import {
  ClientRequestValidationError,
  clientRequestVisibleToClient,
  normalizeStoredClientRequestInput,
  suggestedClientRequestActions,
  type StoredClientRequest,
} from '../src/lib/clientRequestStore';

const appUser = {
  id: '4e01f1f7-5043-4ad1-9866-e1f484aae2ab',
  email: 'nia@example.com',
  full_name: 'Nia McCain',
};

describe('client request store utilities', () => {
  test('normalizes meal-plan change requests and derives trainer actions', () => {
    const normalized = normalizeStoredClientRequestInput(
      {
        kind: 'meal-plan-change',
        message: ' I need more protein and less dairy this week ',
        meals: [
          { id: 'meal-1', name: ' Turkey Bowl ', protein_g: 42, calories: 510, product_url: 'https://example.com/meal' },
          { id: '', name: 'Ignored' },
        ],
      },
      appUser
    );

    expect(normalized).toMatchObject({
      kind: 'meal-plan-change',
      clientName: 'Nia McCain',
      message: 'I need more protein and less dairy this week',
      meals: [{ id: 'meal-1', name: 'Turkey Bowl', protein_g: 42, calories: 510 }],
    });
    expect(normalized.suggestedActions).toContain('Check dietary restriction tags before approving substitutions.');
    expect(normalized.suggestedActions).toContain('Bias replacements toward higher-protein Ideal Nutrition meals.');
  });

  test('rejects empty client messages', () => {
    expect(() => normalizeStoredClientRequestInput({ kind: 'trainer-note', message: '  ' }, appUser)).toThrow(
      ClientRequestValidationError
    );
  });

  test('matches client-visible requests by app user id or normalized email', () => {
    expect(clientRequestVisibleToClient(clientRequest({ appUserId: appUser.id }), appUser)).toBe(true);
    expect(clientRequestVisibleToClient(clientRequest({ appUserId: null, clientEmail: 'NIA@EXAMPLE.COM' }), appUser)).toBe(
      true
    );
    expect(clientRequestVisibleToClient(clientRequest({ appUserId: null, clientEmail: 'other@example.com' }), appUser)).toBe(
      false
    );
  });

  test('keeps suggested action order capped for trainer review', () => {
    const actions = suggestedClientRequestActions(
      'meal-plan-change',
      'I am hungry, need more protein, have a dairy allergy, and my meal time changed.',
      [{ id: 'meal-1', name: 'Turkey Bowl', protein_g: 42, calories: 510, product_url: null }]
    );

    expect(actions).toHaveLength(5);
    expect(actions[0]).toBe('Review requested meal swaps against the trainer-approved plan.');
  });
});

function clientRequest(overrides: Partial<StoredClientRequest> = {}): StoredClientRequest {
  return {
    id: overrides.id ?? 'request-1',
    appUserId: overrides.appUserId === undefined ? appUser.id : overrides.appUserId,
    clientEmail: overrides.clientEmail === undefined ? appUser.email : overrides.clientEmail,
    clientName: overrides.clientName ?? appUser.full_name,
    kind: overrides.kind ?? 'trainer-note',
    message: overrides.message ?? 'Feeling sore today',
    suggestedActions: overrides.suggestedActions ?? ['Review note before the next check-in.'],
    meals: overrides.meals ?? [],
    status: overrides.status ?? 'new',
    reviewedByUserId: overrides.reviewedByUserId ?? null,
    reviewedByEmail: overrides.reviewedByEmail ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-06-12T21:15:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-12T21:15:00.000Z',
  };
}
