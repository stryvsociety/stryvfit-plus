'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Check,
  CircleArrowUp,
  ClipboardList,
  Dumbbell,
  PlayCircle,
  Search,
  Send,
  SlidersHorizontal,
  Sparkles,
  Video,
} from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { GoogleScheduler } from '@/components/scheduling/GoogleScheduler';
import { SystemHealthPanel } from '@/components/incidents/SystemHealthPanel';
import { AdminSectionNav } from '@/components/admin/AdminSectionNav';
import { AdminSupportChat } from '@/components/admin/AdminSupportChat';
import { ThemeToggle, usePersistedTheme } from '@/components/ui/ThemeToggle';
import type { WgerExercise } from '@/lib/wger';

const clients = [
  { name: 'Maya Rivera', status: 'Remote', goal: 'Strength rebuild', payment: 'Active', phase: 'Base strength' },
  { name: 'Devon Clarke', status: 'In person', goal: 'Hypertrophy', payment: 'Due tomorrow', phase: 'Volume block' },
  { name: 'Jordan Ellis', status: 'Remote', goal: 'Conditioning', payment: 'Past due day 3', phase: 'Engine reset' },
];

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
  { name: 'Warmup', detail: 'T-spine reach, 90/90 hip flow, ramp sets', icon: Sparkles },
  { name: 'Main lift', detail: 'Back squat 5x3 @ RPE 7, 2:30 rest', icon: Dumbbell },
  { name: 'Accessory circuit', detail: 'RDL, split squat, cable row, dead bug', icon: SlidersHorizontal },
  { name: 'Remote video notes', detail: 'Demo angles, tempo reminder, no-equipment swap', icon: Video },
];

export function AdminWorkoutsPage() {
  const [selectedClient, setSelectedClient] = useState(clients[0].name);
  const [draftTitle, setDraftTitle] = useState('Lower strength A');
  const [published, setPublished] = useState(false);
  const [theme, setTheme] = usePersistedTheme('stryvadmin-theme', 'light');
  const isDark = theme === 'dark';
  const [exerciseSource, setExerciseSource] = useState('loading');
  const [exerciseLibrary, setExerciseLibrary] = useState<WgerExercise[]>([]);

  const selected = useMemo(
    () => clients.find((client) => client.name === selectedClient) ?? clients[0],
    [selectedClient]
  );

  function publishPlan() {
    setPublished(true);
    window.setTimeout(() => setPublished(false), 1800);
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
    <main className={`min-h-dvh ${isDark ? 'admin-theme-dark bg-[#070e13] text-white' : 'bg-[#f7f7f5] text-[#151515]'}`}>
      <div className="mx-auto grid min-h-dvh max-w-7xl grid-rows-[auto_1fr] px-4 py-4 sm:px-6 lg:px-8">
        <header className="space-y-4 border-b border-[#d9d7d1] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex-none rounded-md bg-[#151515] px-3 py-2">
                <BrandWordmark className="w-[172px]" />
              </div>
              <p className="min-w-0 font-body text-sm text-[#66615a]">
                Build workout blocks, attach coaching video notes, and schedule the plan into StryvFit+.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <ThemeToggle theme={theme} onChange={setTheme} />
              <button
                type="button"
                onClick={publishPlan}
                className="ios-pill group relative inline-flex min-h-11 items-center gap-2 overflow-hidden rounded-full border border-[#f24f09] bg-transparent px-5 font-caption text-[10px] uppercase tracking-[0.14em] text-current transition active:scale-95"
              >
                <span className="absolute inset-0 origin-left scale-x-0 bg-[#f24f09] transition-transform duration-300 ease-out group-hover:scale-x-100" />
                <span className="relative z-10 inline-flex items-center gap-2 transition-colors group-hover:text-white">
                  {published ? <Check className="h-4 w-4" /> : <CircleArrowUp className="h-4 w-4" />}
                  {published ? 'Posted' : 'Post to client'}
                </span>
              </button>
            </div>
          </div>
          <AdminSectionNav active="workouts" />
        </header>

        <section className="grid gap-5 py-5 lg:grid-cols-[260px_1fr_320px]">
          <aside className="rounded-md border border-[#dedbd4] bg-white p-3">
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#dedbd4] px-3">
              <Search className="h-4 w-4 text-[#817b72]" />
              <input className="min-w-0 flex-1 bg-transparent font-body text-sm outline-none" placeholder="Search clients" />
            </label>
            <div className="mt-4 space-y-2">
              {clients.map((client) => {
                const active = selectedClient === client.name;
                return (
                  <button
                    key={client.name}
                    type="button"
                    onClick={() => setSelectedClient(client.name)}
                    className={`w-full rounded-md border p-3 text-left transition ${
                      active ? 'border-[#f24f09] bg-[#fff3ec]' : 'border-[#e6e2da] bg-[#fbfaf8] hover:border-[#f24f09]/50'
                    }`}
                  >
                    <span className="block font-headline text-base uppercase">{client.name}</span>
                    <span className="mt-1 block font-body text-xs text-[#6d675f]">{client.goal}</span>
                    <span className="mt-3 inline-flex rounded-sm bg-[#151515] px-2 py-1 font-caption text-[8px] uppercase tracking-[0.12em] text-white">
                      {client.status}
                    </span>
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="min-w-0 space-y-4">
            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Workout routine</p>
                  <h1 className="mt-1 font-section text-4xl leading-none">Build for {selected.name}</h1>
                  <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-[#66615a]">
                    Draft the session, choose a weekly slot, and publish the coaching notes into the client app.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={publishPlan}
                  className="ios-pill inline-flex min-h-10 items-center gap-2 rounded-full bg-[#151515] px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-white"
                >
                  <Send className="h-4 w-4" /> Publish
                </button>
              </div>

              <label className="mt-5 block">
                <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Plan title</span>
                <input
                  value={draftTitle}
                  onChange={(event) => setDraftTitle(event.target.value)}
                  className="mt-2 min-h-12 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                />
              </label>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {movementBlocks.map((block) => {
                  const Icon = block.icon;
                  return (
                    <article key={block.name} className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="font-headline text-lg uppercase">{block.name}</h2>
                        <Icon className="h-4 w-4 text-[#f24f09]" />
                      </div>
                      <textarea
                        className="mt-3 min-h-24 w-full resize-none rounded-md border border-[#dedbd4] bg-white p-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        defaultValue={block.detail}
                      />
                    </article>
                  );
                })}
              </div>
            </section>

            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <div className="mb-4 flex items-center gap-2">
                <ClipboardList className="h-4 w-4 text-[#f24f09]" />
                <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Training week</p>
              </div>
              <div className="grid gap-2 md:grid-cols-5">
                {trainingWeek.map((day) => (
                  <article key={day.day} className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
                    <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">{day.day}</p>
                    <h3 className="mt-2 font-headline text-lg uppercase leading-none">{day.focus}</h3>
                    <p className="mt-2 font-body text-xs text-[#6d675f]">{day.load}</p>
                    <p className="mt-4 font-caption text-[8px] uppercase tracking-[0.12em] text-[#f24f09]">{day.status}</p>
                  </article>
                ))}
              </div>
            </section>
          </section>

          <aside className="space-y-4">
            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Next client</p>
              <h2 className="mt-2 font-section text-3xl leading-none">{selected.name}</h2>
              <dl className="mt-4 grid gap-2">
                {[
                  ['Phase', selected.phase],
                  ['Goal', selected.goal],
                  ['Billing', selected.payment],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-md bg-[#f5f2ed] px-3 py-2">
                    <dt className="font-caption text-[9px] uppercase tracking-[0.12em] text-[#817b72]">{label}</dt>
                    <dd className="font-body text-xs text-[#151515]">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <AdminSupportChat clientName={selected.name} />

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
                    onClick={() => setDraftTitle(item.name)}
                    className="w-full rounded-md border border-[#e6e2da] bg-[#fff8f2] p-3 text-left transition hover:border-[#f24f09]/60"
                  >
                    <span className="block font-headline text-base uppercase">{item.name}</span>
                    <span className="mt-1 block font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">
                      {item.category}
                    </span>
                    <span className="mt-2 block font-body text-xs leading-relaxed text-[#6d675f]">
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
                    onClick={() => setDraftTitle(item.title)}
                    className="w-full rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3 text-left transition hover:border-[#f24f09]/60"
                  >
                    <span className="block font-headline text-base uppercase">{item.title}</span>
                    <span className="mt-1 block font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">{item.level}</span>
                    <span className="mt-2 block font-body text-xs leading-relaxed text-[#6d675f]">{item.blocks}</span>
                  </button>
                ))}
              </div>
            </section>

            <div className="rounded-md border border-[#dedbd4] bg-white p-2">
              <SystemHealthPanel compact />
            </div>
          </aside>

          <div className="lg:col-span-3">
            <GoogleScheduler
              title={`${draftTitle} for ${selected.name}`}
              description={`Workout focus: ${selected.goal}. Phase: ${selected.phase}.`}
              durationMinutes={60}
              variant="timeline"
              manageAvailability
            />
          </div>
        </section>
      </div>
    </main>
  );
}
