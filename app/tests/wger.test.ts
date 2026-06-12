import { afterEach, describe, expect, test } from 'bun:test';
import { fetchWgerExercises } from '../src/lib/wger';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('wger exercise proxy utilities', () => {
  test('limits fallback exercises when upstream wger fails', async () => {
    globalThis.fetch = async () => new Response('unavailable', { status: 503 });

    const payload = await fetchWgerExercises({ limit: 2 });

    expect(payload.source).toBe('fallback');
    expect(payload.exercises).toHaveLength(2);
    expect(payload.exercises.map((exercise) => exercise.name)).toEqual(['Goblet squat', 'Dumbbell row']);
  });

  test('limits fallback exercises when upstream returns no usable exercises', async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ results: [] }), {
        headers: { 'content-type': 'application/json' },
      });

    const payload = await fetchWgerExercises({ limit: 1 });

    expect(payload.source).not.toBe('fallback');
    expect(payload.exercises).toHaveLength(1);
    expect(payload.exercises[0]?.name).toBe('Goblet squat');
  });

  test('clamps remote exercise results before returning them', async () => {
    const seenUrls: string[] = [];
    globalThis.fetch = async (input) => {
      seenUrls.push(String(input));
      return new Response(
        JSON.stringify({
          results: [
            { id: 10, translations: [{ language: 2, name: 'Back squat' }] },
            { id: 11, translations: [{ language: 2, name: 'Bench press' }] },
            { id: 12, translations: [{ language: 2, name: 'Deadlift' }] },
          ],
        }),
        { headers: { 'content-type': 'application/json' } }
      );
    };

    const payload = await fetchWgerExercises({ limit: 2 });

    expect(seenUrls[0]).toContain('limit=2');
    expect(payload.exercises.map((exercise) => exercise.name)).toEqual(['Back squat', 'Bench press']);
  });
});
