import { describe, expect, test } from 'bun:test';
import {
  ClientRequestValidationError,
  clientRequestVisibleToClient,
  normalizeStoredClientRequestInput,
  type StoredClientRequest,
} from '../src/lib/clientRequestStore';

const appUser = {
  id: '4e01f1f7-5043-4ad1-9866-e1f484aae2ab',
  email: 'nia@example.com',
  full_name: 'Nia McCain',
};

describe('client request store utilities', () => {
  test('normalizes trainer notes without accepting meal-plan input', () => {
    const normalized = normalizeStoredClientRequestInput(
      {
        kind: 'trainer-note',
        message: ' I need help with my next session ',
      },
      appUser
    );

    expect(normalized).toMatchObject({
      kind: 'trainer-note',
      clientName: 'Nia McCain',
      message: 'I need help with my next session',
    });
    expect(normalized.suggestedActions).toEqual(['Review note before the next check-in.']);
  });

  test('rejects retired meal-plan change requests', () => {
    expect(() => normalizeStoredClientRequestInput({ kind: 'meal-plan-change', message: 'Change my meals' }, appUser)).toThrow(
      ClientRequestValidationError
    );
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
    status: overrides.status ?? 'new',
    reviewedByUserId: overrides.reviewedByUserId ?? null,
    reviewedByEmail: overrides.reviewedByEmail ?? null,
    reviewedAt: overrides.reviewedAt ?? null,
    createdAt: overrides.createdAt ?? '2026-06-12T21:15:00.000Z',
    updatedAt: overrides.updatedAt ?? '2026-06-12T21:15:00.000Z',
  };
}
