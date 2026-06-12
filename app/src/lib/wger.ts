export type WgerExercise = {
  id: number;
  name: string;
  category: string;
  muscles: string[];
  equipment: string[];
  description: string;
};

type WgerListResponse<T> = {
  results?: T[];
};

type WgerExerciseInfo = {
  id: number;
  name?: string;
  category?: { name?: string };
  muscles?: { name?: string; name_en?: string }[];
  equipment?: { name?: string }[];
  description?: string;
  translations?: { name?: string; description?: string; language?: number }[];
};

const fallbackExercises: WgerExercise[] = [
  {
    id: 1,
    name: 'Goblet squat',
    category: 'Legs',
    muscles: ['Quadriceps', 'Glutes'],
    equipment: ['Dumbbell'],
    description: 'Squat pattern for strength blocks, regressions, and remote sessions.',
  },
  {
    id: 2,
    name: 'Dumbbell row',
    category: 'Back',
    muscles: ['Latissimus dorsi', 'Trapezius'],
    equipment: ['Dumbbell'],
    description: 'Horizontal pull option with simple load and tempo coaching.',
  },
  {
    id: 3,
    name: 'Tempo push-up',
    category: 'Chest',
    muscles: ['Pectorals', 'Triceps'],
    equipment: ['Bodyweight'],
    description: 'Bodyweight pressing movement that works well for in-app remote plans.',
  },
];

function normalizeLimit(limit = 12) {
  return Math.min(Math.max(Number.isFinite(limit) ? Math.trunc(limit) : 12, 1), 30);
}

function fallbackForLimit(limit: number) {
  return fallbackExercises.slice(0, limit);
}

function cleanHtml(value?: string) {
  return (value ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeExercise(item: WgerExerciseInfo): WgerExercise {
  const english = item.translations?.find((translation) => translation.language === 2) ?? item.translations?.[0];

  return {
    id: item.id,
    name: english?.name || item.name || `Exercise ${item.id}`,
    category: item.category?.name || 'General',
    muscles:
      item.muscles
        ?.map((muscle) => muscle.name_en || muscle.name)
        .filter((name): name is string => Boolean(name)) ?? [],
    equipment:
      item.equipment
        ?.map((equipment) => equipment.name)
        .filter((name): name is string => Boolean(name)) ?? [],
    description: cleanHtml(english?.description || item.description),
  };
}

export async function fetchWgerExercises({
  query,
  limit = 12,
}: {
  query?: string;
  limit?: number;
} = {}): Promise<{ source: string; exercises: WgerExercise[] }> {
  const normalizedLimit = normalizeLimit(limit);
  const baseUrl = (process.env.WGER_API_BASE_URL || 'https://wger.de').replace(/\/$/, '');
  const url = new URL('/api/v2/exerciseinfo/', baseUrl);
  url.searchParams.set('language', '2');
  url.searchParams.set('limit', String(normalizedLimit));
  url.searchParams.set('format', 'json');
  if (query?.trim()) url.searchParams.set('term', query.trim());

  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        ...(process.env.WGER_API_TOKEN ? { Authorization: `Token ${process.env.WGER_API_TOKEN}` } : {}),
      },
      next: { revalidate: 60 * 60 },
    });

    if (!res.ok) throw new Error(`wger returned ${res.status}`);

    const data = (await res.json()) as WgerListResponse<WgerExerciseInfo>;
    const exercises = (data.results ?? [])
      .map(normalizeExercise)
      .filter((exercise) => exercise.name)
      .slice(0, normalizedLimit);

    return {
      source: baseUrl,
      exercises: exercises.length > 0 ? exercises : fallbackForLimit(normalizedLimit),
    };
  } catch {
    return {
      source: 'fallback',
      exercises: fallbackForLimit(normalizedLimit),
    };
  }
}
