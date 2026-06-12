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
import type { AdminClientSummary } from '@/lib/bookings';
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

type ClientsResponse = {
  clients?: AdminClientSummary[];
  error?: string;
};

type PublishResponse = {
  error?: string;
  routine?: { id: string };
  publishedRecord?: { id: string };
};

type WorkoutExerciseSelection = {
  id: number;
  name: string;
  category: string;
  source: string;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;

function clientCanReceiveWorkoutPost(client: AdminClientSummary | null): client is AdminClientSummary {
  return Boolean(client && (client.email || UUID_RE.test(client.id)));
}

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
  const [blocks, setBlocks] = useState(movementBlocks.map((block, order) => ({ ...block, order })));
  const [clients, setClients] = useState<AdminClientSummary[]>([]);
  const [clientsLoading, setClientsLoading] = useState(true);
  const [selectedClientId, setSelectedClientId] = useState('');
  const [selectedExercises, setSelectedExercises] = useState<WorkoutExerciseSelection[]>([]);
  const [postPending, setPostPending] = useState(false);
  const [posted, setPosted] = useState(false);
  const [postBusy, setPostBusy] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [postNotice, setPostNotice] = useState<string | null>(null);
  const [theme, setTheme] = usePersistedTheme('stryvadmin-theme', 'light');
  const [exerciseSource, setExerciseSource] = useState('loading');
  const [exerciseLibrary, setExerciseLibrary] = useState<WgerExercise[]>([]);
  const selectedClient = clients.find((client) => client.id === selectedClientId) ?? clients[0] ?? null;

  function markPostPending() {
    setPostPending(true);
    setPosted(false);
    setPostError(null);
    setPostNotice(null);
  }

  function updateBlock(index: number, detail: string) {
    setBlocks((current) => current.map((block, blockIndex) => (blockIndex === index ? { ...block, detail } : block)));
    markPostPending();
  }

  function selectExercise(item: WgerExercise) {
    setDraftTitle(item.name);
    setSelectedExercises((current) => {
      if (current.some((exercise) => exercise.id === item.id)) return current;
      return [
        ...current,
        {
          id: item.id,
          name: item.name,
          category: item.category,
          source: exerciseSource,
        },
      ].slice(-6);
    });
    markPostPending();
  }

  async function publishPlan() {
    if (postBusy) return;
    if (!clientCanReceiveWorkoutPost(selectedClient)) {
      setPostError('Choose a client before posting this workout.');
      setPostPending(true);
      return;
    }

    setPostBusy(true);
    setPostError(null);
    setPostNotice(null);
    try {
      const response = await fetch('/api/admin/workout-routines', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          clientId: UUID_RE.test(selectedClient.id) ? selectedClient.id : null,
          clientEmail: selectedClient.email,
          clientName: selectedClient.name,
          title: draftTitle,
          summary: blocks.map((block) => `${block.name}: ${block.detail}`).join(' '),
          blocks,
          selectedExercises,
          trainingWeek,
          publish: true,
          syncToWger: false,
        }),
      });
      const payload = (await response.json().catch(() => null)) as PublishResponse | null;
      if (!response.ok || !payload?.routine) throw new Error(payload?.error ?? 'Unable to post workout');

      setPostPending(false);
      setPosted(true);
      setPostNotice(`Posted workout to ${selectedClient.name}.`);
      window.setTimeout(() => setPosted(false), 1800);
    } catch (error) {
      setPostPending(true);
      setPosted(false);
      setPostError(error instanceof Error ? error.message : 'Unable to post workout');
    } finally {
      setPostBusy(false);
    }
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

  useEffect(() => {
    let cancelled = false;

    async function loadClients() {
      setClientsLoading(true);
      try {
        const res = await fetch('/api/admin/clients?limit=80');
        const payload = (await res.json().catch(() => null)) as ClientsResponse | null;
        if (!res.ok) throw new Error(payload?.error ?? `client roster returned ${res.status}`);
        const roster = payload?.clients ?? [];
        if (!cancelled) {
          setClients(roster);
          setSelectedClientId((current) => current || roster[0]?.id || '');
        }
      } catch (error) {
        if (!cancelled) setPostError(error instanceof Error ? error.message : 'Unable to load client roster');
      } finally {
        if (!cancelled) setClientsLoading(false);
      }
    }

    void loadClients();
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
            <section className="min-w-0">
              <label className="mb-4 block">
                <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Post to client</span>
                <select
                  value={selectedClientId}
                  onChange={(event) => {
                    setSelectedClientId(event.target.value);
                    markPostPending();
                  }}
                  disabled={clientsLoading || clients.length === 0}
                  className="mt-2 min-h-12 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09] disabled:opacity-60"
                >
                  {clients.length === 0 ? (
                    <option value="">{clientsLoading ? 'Loading clients' : 'No clients available'}</option>
                  ) : (
                    clients.map((client) => (
                      <option key={`${client.id}:${client.email ?? client.name}`} value={client.id}>
                        {client.name}{client.email ? ` - ${client.email}` : ''}
                      </option>
                    ))
                  )}
                </select>
              </label>
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

              <div className="admin-fade-stack mt-4 grid">
                {blocks.map((block, index) => (
                    <article key={block.name} className="grid gap-3 py-3 md:grid-cols-[180px_1fr] md:items-start">
                      <div>
                        <h2 className="font-headline text-lg uppercase">{block.name}</h2>
                      </div>
                      <textarea
                        className="min-h-20 w-full resize-none rounded-md border border-[#dedbd4] bg-white p-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        value={block.detail}
                        onChange={(event) => updateBlock(index, event.target.value)}
                      />
                    </article>
                ))}
              </div>
              {postNotice ? <p className="mt-3 font-body text-xs leading-relaxed text-[#6d675f]">{postNotice}</p> : null}
              {postError ? <p className="mt-3 font-body text-xs leading-relaxed text-[#d12f1b]">{postError}</p> : null}
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
                    onClick={() => selectExercise(item)}
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

          <FloatingPostToClientButton
            busy={postBusy}
            disabled={!clientCanReceiveWorkoutPost(selectedClient) || clientsLoading}
            error={postError}
            posted={posted}
            visible={postPending || posted || Boolean(postError)}
            onClick={() => void publishPlan()}
          />
        </section>
    </AdminShell>
  );
}
