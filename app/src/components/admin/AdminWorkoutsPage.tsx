'use client';

import { useEffect, useState } from 'react';
import {
  ClipboardList,
  Pencil,
  PlayCircle,
} from 'lucide-react';
import { AdminShell } from '@/components/admin/AdminShell';
import { FloatingPostToClientButton } from '@/components/admin/FloatingPostToClientButton';
import { usePersistedTheme } from '@/components/ui/ThemeToggle';
import type { WgerExercise } from '@/lib/wger';

const workoutLibrary = [
  { title: 'Lower strength A', level: 'Intermediate', blocks: 'Squat pattern, hinge accessory, carries' },
  { title: 'Upper volume B', level: 'Hypertrophy', blocks: 'Press, pull, delts, arms, trunk' },
  { title: 'Remote hotel session', level: 'Travel', blocks: 'Tempo split squat, band row, incline push-up' },
  { title: 'Conditioning reset', level: 'All levels', blocks: 'Bike intervals, sled push, mobility cooldown' },
];

type ExerciseResponse = {
  source: string;
  exercises: WgerExercise[];
};

const trainingWeek = [
  { day: 'Mon', focus: 'Lower strength', load: 'Heavy', status: 'Ready' },
  { day: 'Tue', focus: 'Recovery walk', load: 'Light', status: 'Auto-send' },
  { day: 'Wed', focus: 'Upper volume', load: 'Medium', status: 'Needs video' },
  { day: 'Thu', focus: 'Mobility', load: 'Light', status: 'Ready' },
  { day: 'Fri', focus: 'Conditioning', load: 'Hard', status: 'Review' },
];

const movementBlocks = [
  { name: 'Warmup', detail: 'T-spine reach, 90/90 hip flow, ramp sets' },
  { name: 'Main lift', detail: 'Back squat 5x3 @ RPE 7, 2:30 rest' },
  { name: 'Accessory circuit', detail: 'RDL, split squat, cable row, dead bug' },
  { name: 'Remote video notes', detail: 'Demo angles, tempo reminder, no-equipment swap' },
];

export function AdminWorkoutsPage() {
  const [draftTitle, setDraftTitle] = useState('Lower strength A');
  const [postPending, setPostPending] = useState(false);
  const [posted, setPosted] = useState(false);
  const [theme, setTheme] = usePersistedTheme('stryvadmin-theme', 'light');
  const [exerciseSource, setExerciseSource] = useState('loading');
  const [exerciseLibrary, setExerciseLibrary] = useState<WgerExercise[]>([]);

  function markPostPending() {
    setPostPending(true);
    setPosted(false);
  }

  function publishPlan() {
    setPostPending(false);
    setPosted(true);
    window.setTimeout(() => setPosted(false), 1800);
  }

  useEffect(() => {
    let cancelled = false;

    async function loadExercises() {
      try {
        const res = await fetch('/api/wger/exercises?limit=9');
        if (!res.ok) throw new Error(`wger proxy returned ${res.status}`);
        const payload = (await res.json()) as ExerciseResponse;
        if (!cancelled) {
          setExerciseSource(payload.source);
          setExerciseLibrary(payload.exercises);
        }
      } catch {
        if (!cancelled) {
          setExerciseSource('fallback');
          setExerciseLibrary([]);
        }
      }
    }

    void loadExercises();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell
      active="workouts"
      breadcrumbs={[{ label: 'Admin', href: '/admin/pulse' }, { label: 'Workouts' }]}
      onThemeChange={setTheme}
      theme={theme}
      title="Workouts"
    >
        <section className="space-y-4">
            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <label className="block">
                <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Plan title</span>
                <span className="relative mt-2 block">
                  <input
                    value={draftTitle}
                    onChange={(event) => {
                      setDraftTitle(event.target.value);
                      markPostPending();
                    }}
                    className="min-h-12 w-full rounded-md border border-[#dedbd4] px-3 pr-11 font-body text-sm outline-none focus:border-[#f24f09]"
                  />
                  <Pencil
                    aria-hidden="true"
                    className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#817b72]"
                    strokeWidth={1.8}
                  />
                </span>
              </label>

              <div className="mt-4 grid gap-2">
                {movementBlocks.map((block) => (
                    <article key={block.name} className="grid gap-3 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3 md:grid-cols-[180px_1fr] md:items-start">
                      <div>
                        <h2 className="font-headline text-lg uppercase">{block.name}</h2>
                      </div>
                      <textarea
                        className="min-h-20 w-full resize-none rounded-md border border-[#dedbd4] bg-white p-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        defaultValue={block.detail}
                        onChange={markPostPending}
                      />
                    </article>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#f24f09]" />
                <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Training week</p>
              </div>
              <div className="grid gap-2">
                {trainingWeek.map((day) => (
                  <article key={day.day} className="grid gap-3 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3 md:grid-cols-[80px_1fr_120px] md:items-center">
                    <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">{day.day}</p>
                    <div>
                      <h3 className="font-headline text-lg uppercase leading-none">{day.focus}</h3>
                      <p className="mt-1 font-body text-xs text-[#6d675f]">{day.load}</p>
                    </div>
                    <p className="justify-self-start font-caption text-[8px] uppercase tracking-[0.12em] text-[#f24f09] md:justify-self-end">{day.status}</p>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <PlayCircle className="h-4 w-4 text-[#f24f09]" />
                <div>
                  <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Library</p>
                  <p className="mt-1 font-body text-[11px] text-[#817b72]">
                    {exerciseSource === 'loading' ? 'Connecting to wger' : `Source: ${exerciseSource}`}
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                {exerciseLibrary.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setDraftTitle(item.name);
                      markPostPending();
                    }}
                    className="w-full rounded-md border border-[#3a332d] bg-[#181818] p-3 text-left text-white transition hover:border-[#f24f09]/60"
                  >
                    <span className="block font-headline text-base uppercase">{item.name}</span>
                    <span className="mt-1 block font-caption text-[8px] uppercase tracking-[0.12em] text-[#f24f09]">
                      {item.category}
                    </span>
                    <span className="mt-2 block font-body text-xs leading-relaxed text-[#d8d2c9]">
                      {[...item.muscles, ...item.equipment].slice(0, 4).join(', ') ||
                        item.description ||
                        'Exercise reference'}
                    </span>
                  </button>
                ))}
                {workoutLibrary.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    onClick={() => {
                      setDraftTitle(item.title);
                      markPostPending();
                    }}
                    className="w-full rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3 text-left transition hover:border-[#f24f09]/60"
                  >
                    <span className="block font-headline text-base uppercase">{item.title}</span>
                    <span className="mt-1 block font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">{item.level}</span>
                    <span className="mt-2 block font-body text-xs leading-relaxed text-[#6d675f]">{item.blocks}</span>
                  </button>
                ))}
              </div>
            </section>

          <FloatingPostToClientButton posted={posted} visible={postPending || posted} onClick={publishPlan} />
        </section>
    </AdminShell>
  );
}
