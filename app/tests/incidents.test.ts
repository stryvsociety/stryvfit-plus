import { describe, expect, test } from 'bun:test';
import {
  fingerprintIncident,
  interpretIncident,
  linearPriorityForSeverity,
  validateIncidentPayload,
} from '../src/lib/incidents';
import { shouldRunForNewYorkFivePm } from '../scripts/worker-incident-resolution-sync.mjs';

describe('incident utilities', () => {
  test('normalizes volatile fingerprints', () => {
    const first = fingerprintIncident({
      source: 'browserbase',
      route: '/admin/pulse',
      message: 'Failed https://example.com/items/1234567890 token abcdefabcdefabcdefabcdef',
    });
    const second = fingerprintIncident({
      source: 'browserbase',
      route: '/admin/pulse',
      message: 'Failed https://example.com/items/9999999999 token 111111111111111111111111',
    });

    expect(first).toBe(second);
  });

  test('validates payload defaults', () => {
    const payload = validateIncidentPayload({
      source: 'unknown',
      route: '',
      message: 'Calendar failed',
      severity: 'nope',
    });

    expect(payload).toMatchObject({
      source: 'client',
      route: '/',
      message: 'Calendar failed',
      severity: 'medium',
    });
    expect(payload?.fingerprint).toContain('client:/');
  });

  test('maps severity to Linear priority', () => {
    expect(linearPriorityForSeverity('critical')).toBe(1);
    expect(linearPriorityForSeverity('high')).toBe(2);
    expect(linearPriorityForSeverity('medium')).toBe(3);
    expect(linearPriorityForSeverity('low')).toBe(4);
  });

  test('translates database incidents for non-technical users', () => {
    const interpretation = interpretIncident({
      source: 'supabase',
      route: '/admin/pulse',
      message: 'PGRST205 relation public.bookings does not exist',
      severity: 'high',
    });

    expect(interpretation.title).toBe('Database Error');
    expect(interpretation.summary).toContain('Admin dashboard');
    expect(interpretation.technicalSummary).toContain('PGRST205');
  });

  test('keeps service-worker URLs behind app update copy', () => {
    const interpretation = interpretIncident({
      source: 'pwa',
      route: '/sign-in-admin',
      message: 'Script https://app.stryvsocietyfit.com/sw.js load failed',
      severity: 'medium',
    });

    expect(interpretation.title).toBe('App Update Error');
    expect(interpretation.summary).toContain('installed app shell');
    expect(interpretation.technicalSummary).toContain('https://app.stryvsocietyfit.com/sw.js');
  });

  test('runs Linear issue tracking at 5PM New York time only', () => {
    expect(shouldRunForNewYorkFivePm('2026-06-12T21:00:00.000Z')).toBe(true);
    expect(shouldRunForNewYorkFivePm('2026-12-12T22:00:00.000Z')).toBe(true);
    expect(shouldRunForNewYorkFivePm('2026-06-12T20:00:00.000Z')).toBe(false);
  });
});
