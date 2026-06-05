'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  ChefHat,
  Check,
  CircleArrowUp,
  ClipboardList,
  Flame,
  Inbox,
  Plus,
  Search,
  ShoppingCart,
  Trash2,
  Utensils,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { GoogleScheduler } from '@/components/scheduling/GoogleScheduler';
import { MealPrepPlanner } from '@/components/meals/MealPrepPlanner';
import { SystemHealthPanel } from '@/components/incidents/SystemHealthPanel';
import { BrandWordmark } from '@/components/BrandWordmark';
import { AdminSectionNav } from '@/components/admin/AdminSectionNav';
import { AdminSupportChat } from '@/components/admin/AdminSupportChat';
import { ThemeToggle, usePersistedTheme } from '@/components/ui/ThemeToggle';
import { readClientRequests, type ClientRequest } from '@/lib/clientRequests';
import type { AdminBookingSummary } from '@/lib/bookings';

type AdminTab = 'appointments' | 'meals' | 'clients';

const defaultClients = [
  { name: 'Maya Rivera', status: 'Remote', goal: 'Strength rebuild', payment: 'Active' },
  { name: 'Devon Clarke', status: 'In person', goal: 'Hypertrophy', payment: 'Due tomorrow' },
  { name: 'Jordan Ellis', status: 'Remote', goal: 'Conditioning', payment: 'Past due day 3' },
];

const nutritionTargets: Record<
  string,
  { calories: string; protein: string; cadence: string; note: string; compliance: string }
> = {
  'Maya Rivera': {
    calories: '2,050',
    protein: '155g',
    cadence: '5 meals + 2 flex',
    note: 'Strength rebuild block. Bias higher carbs around lower-body sessions.',
    compliance: '87%',
  },
  'Devon Clarke': {
    calories: '2,650',
    protein: '190g',
    cadence: '6 meals + shake',
    note: 'Hypertrophy phase. Keep protein high and schedule a midweek check-in.',
    compliance: '74%',
  },
  'Jordan Ellis': {
    calories: '1,900',
    protein: '145g',
    cadence: '4 meals + 3 flex',
    note: 'Conditioning reset. Watch missed meals and evening snack drift.',
    compliance: '62%',
  },
};

const nutritionWeek = [
  { day: 'Mon', focus: 'High protein', meal: 'Steak bowl', status: 'Ready' },
  { day: 'Tue', focus: 'Training carbs', meal: 'Chicken pasta', status: 'Needs pick' },
  { day: 'Wed', focus: 'Lean reset', meal: 'Turkey plate', status: 'Ready' },
  { day: 'Thu', focus: 'Recovery', meal: 'Salmon greens', status: 'Review' },
  { day: 'Fri', focus: 'Flex slot', meal: 'Coach choice', status: 'Open' },
];

const prepChecklist = [
  { label: 'Ideal Nutrition menu pulled', status: 'Live' },
  { label: 'Client brief generated', status: 'Draft' },
  { label: 'Google check-in scheduled', status: 'Queued' },
  { label: 'StryvFit+ publish state', status: 'Ready' },
];

type AdminClientSummary = (typeof defaultClients)[number];

function clientNameFromBooking(booking: AdminBookingSummary): string {
  return booking.clientName?.trim() || booking.clientEmail?.trim() || 'StryvFit+ client';
}

function buildClientRoster(bookings: AdminBookingSummary[]): AdminClientSummary[] {
  const byName = new Map<string, AdminClientSummary>();

  for (const booking of bookings) {
    const name = clientNameFromBooking(booking);
    if (!byName.has(name)) {
      byName.set(name, {
        name,
        status: booking.serviceType === 'free' ? 'First session booked' : 'Booked',
        goal: booking.serviceLabel,
        payment: booking.status === 'pending_payment' ? 'Payment pending' : 'Active',
      });
    }
  }

  for (const client of defaultClients) {
    if (!byName.has(client.name)) byName.set(client.name, client);
  }

  return [...byName.values()];
}

export function TrainerOpsStudio({ initialBookings = [] }: { initialBookings?: AdminBookingSummary[] }) {
  const [tab, setTab] = useState<AdminTab>('appointments');
  const [bookings, setBookings] = useState<AdminBookingSummary[]>(initialBookings);
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [theme, setTheme] = usePersistedTheme('stryvadmin-theme', 'light');
  const isDark = theme === 'dark';
  const clients = useMemo(() => buildClientRoster(bookings), [bookings]);
  const [selectedClient, setSelectedClient] = useState(() => clients[0]?.name ?? defaultClients[0].name);

  const selected = useMemo(
    () => clients.find((client) => client.name === selectedClient) ?? clients[0] ?? defaultClients[0],
    [clients, selectedClient]
  );

  function publishPlan() {
    setPublished(true);
    window.setTimeout(() => setPublished(false), 1800);
  }

  async function cancelBookingById(bookingId: string) {
    setCancelingBookingId(bookingId);
    setCancelNotice(null);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, { method: 'DELETE' });
      const payload = (await response.json().catch(() => null)) as { error?: string; calendarWarning?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to cancel booking');

      setBookings((current) => current.filter((booking) => booking.id !== bookingId));
      setCancelNotice(payload?.calendarWarning ? `Cancelled locally. ${payload.calendarWarning}` : 'Appointment cancelled.');
    } catch (error) {
      setCancelNotice(error instanceof Error ? error.message : 'Unable to cancel booking');
    } finally {
      setCancelingBookingId(null);
    }
  }

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('tab') === 'meals') {
      setTab('meals');
    } else if (params.get('tab') === 'clients') {
      setTab('clients');
    }
  }, []);

  useEffect(() => {
    setBookings(initialBookings);
  }, [initialBookings]);

  useEffect(() => {
    if (!clients.some((client) => client.name === selectedClient)) {
      setSelectedClient(clients[0]?.name ?? defaultClients[0].name);
    }
  }, [clients, selectedClient]);

  return (
    <main className={`min-h-dvh ${isDark ? 'admin-theme-dark bg-[#070e13] text-white' : 'bg-[#f7f7f5] text-[#151515]'}`}>
      <div className="mx-auto grid min-h-dvh max-w-7xl grid-rows-[auto_1fr] px-4 py-4 sm:px-6 lg:px-8">
        <header className="space-y-4 border-b border-[#d9d7d1] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 flex-wrap items-center gap-3">
              <div className="flex-none rounded-md bg-[#151515] px-3 py-2">
                <BrandWordmark className="w-[172px]" />
              </div>
              <div className="min-w-0">
                <p className="font-body text-sm text-[#66615a]">
                  Manage appointments, meal plans, and workout routines before they reach StryvFit+.
                </p>
              </div>
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
          <AdminSectionNav
            active={tab}
            onAppointments={() => setTab('appointments')}
            onMeals={() => setTab('meals')}
            onClients={() => setTab('clients')}
          />
        </header>

        <section className="grid gap-5 py-5 lg:grid-cols-[260px_1fr_320px]">
          <aside className="rounded-md border border-[#dedbd4] bg-white p-3">
            <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#dedbd4] px-3">
              <Search className="h-4 w-4 text-[#817b72]" />
              <input
                className="min-w-0 flex-1 bg-transparent font-body text-sm outline-none"
                placeholder="Search clients"
              />
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

          <section className="min-w-0">
            {tab === 'appointments' ? (
              <AppointmentsPanel
                bookings={bookings}
                cancelingBookingId={cancelingBookingId}
                cancelNotice={cancelNotice}
                onCancelBooking={cancelBookingById}
              />
            ) : null}
            {tab === 'meals' ? <MealsPanel selectedClient={selected.name} /> : null}
            {tab === 'clients' ? <ClientsPanel /> : null}
          </section>

          <aside className="space-y-4">
            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Next client</p>
              <h2 className="mt-2 font-section text-3xl leading-none">{selected.name}</h2>
              <dl className="mt-4 grid gap-2">
                {[
                  ['Session', selected.status],
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
            <div className="rounded-md border border-[#dedbd4] bg-white p-2">
              <SystemHealthPanel compact />
            </div>
          </aside>

          {tab === 'appointments' ? (
            <div className="lg:col-span-3">
              <GoogleScheduler
                title={`StryvFit+ session for ${selected.name}`}
                description="Trainer-managed appointment block pushed from StryvAdmin."
                durationMinutes={60}
                variant="timeline"
                manageAvailability
              />
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}

function ClientsPanel() {
  const [requests, setRequests] = useState<ClientRequest[]>([]);

  useEffect(() => {
    function refresh() {
      setRequests(readClientRequests());
    }

    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('stryvfit-client-request', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('stryvfit-client-request', refresh);
    };
  }, []);

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <section className="rounded-md border border-[#dedbd4] bg-white p-4">
        <div className="flex items-center gap-2">
          <Inbox className="h-4 w-4 text-[#f24f09]" />
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Client inbox</p>
        </div>
        <h2 className="mt-2 font-section text-4xl leading-none">Trainer requests</h2>
        <p className="mt-2 font-body text-sm leading-relaxed text-[#66615a]">
          Client notes and meal-plan change requests are enriched into suggested actions before review.
        </p>
      </section>

      {requests.length === 0 ? (
        <section className="rounded-md border border-[#dedbd4] bg-white p-6 text-center">
          <p className="font-headline text-xl uppercase text-[#151515]">No client requests yet</p>
          <p className="mt-2 font-body text-sm text-[#66615a]">Submit a note from StryvFit+ to populate this tab.</p>
        </section>
      ) : (
        <section className="space-y-3">
          {requests.map((request) => (
            <article key={request.id} className="rounded-md border border-[#dedbd4] bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-[#f24f09]">
                    {request.kind === 'meal-plan-change' ? 'Meal plan change' : 'Trainer note'}
                  </p>
                  <h3 className="mt-1 font-headline text-xl uppercase">{request.clientName}</h3>
                </div>
                <p className="font-caption text-[9px] uppercase tracking-[0.12em] text-[#817b72]">
                  {new Date(request.createdAt).toLocaleString()}
                </p>
              </div>
              <p className="mt-3 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3 font-body text-sm leading-relaxed text-[#151515]">
                {request.message}
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {request.suggestedActions.map((action) => (
                  <div key={action} className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
                    <p className="font-body text-xs leading-relaxed text-[#66615a]">{action}</p>
                  </div>
                ))}
              </div>
              {request.meals.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {request.meals.map((meal) => (
                    <span
                      key={meal.id}
                      className="rounded-sm bg-[#151515] px-2 py-1 font-caption text-[8px] uppercase tracking-[0.12em] text-white"
                    >
                      {meal.name}
                    </span>
                  ))}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      )}
    </motion.section>
  );
}

function MealsPanel({ selectedClient }: { selectedClient: string }) {
  const target = nutritionTargets[selectedClient] ?? nutritionTargets['Maya Rivera'];

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <section className="rounded-md border border-[#dedbd4] bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">
              Nutrition command
            </p>
            <h2 className="mt-1 font-section text-4xl leading-none">Meal plan for {selectedClient}</h2>
            <p className="mt-2 max-w-xl font-body text-sm leading-relaxed text-[#66615a]">{target.note}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              ['Calories', target.calories],
              ['Protein', target.protein],
              ['Adherence', target.compliance],
            ].map(([label, value]) => (
              <div key={label} className="min-w-20 rounded-md border border-[#dedbd4] bg-[#f7f7f5] px-3 py-2 text-right">
                <p className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">{label}</p>
                <p className="mt-1 font-headline text-base uppercase text-[#151515]">{value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 grid gap-3 md:grid-cols-3">
          <article className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
            <div className="flex items-center gap-2">
              <Utensils className="h-4 w-4 text-[#f24f09]" />
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Cadence</p>
            </div>
            <p className="mt-3 font-headline text-2xl uppercase leading-none">{target.cadence}</p>
            <p className="mt-2 font-body text-xs leading-relaxed text-[#6d675f]">
              Weekly Ideal Nutrition structure before coach-approved substitutions.
            </p>
          </article>
          <article className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
            <div className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-[#f24f09]" />
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Fulfillment</p>
            </div>
            <p className="mt-3 font-headline text-2xl uppercase leading-none">Order window</p>
            <p className="mt-2 font-body text-xs leading-relaxed text-[#6d675f]">
              Confirm selections before Sunday evening so meals land before training day one.
            </p>
          </article>
          <article className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
            <div className="flex items-center gap-2">
              <Flame className="h-4 w-4 text-[#f24f09]" />
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Training match</p>
            </div>
            <p className="mt-3 font-headline text-2xl uppercase leading-none">Fuel timing</p>
            <p className="mt-2 font-body text-xs leading-relaxed text-[#6d675f]">
              Pair higher-carb meals with strength and conditioning blocks.
            </p>
          </article>
        </div>
      </section>

      <section className="rounded-md border border-[#dedbd4] bg-white p-4">
        <div className="mb-4 flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-[#f24f09]" />
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Weekly nutrition board</p>
        </div>
        <div className="grid gap-2 md:grid-cols-5">
          {nutritionWeek.map((day) => (
            <article key={day.day} className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
              <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">{day.day}</p>
              <h3 className="mt-2 font-headline text-lg uppercase leading-none">{day.focus}</h3>
              <p className="mt-2 font-body text-xs text-[#6d675f]">{day.meal}</p>
              <p className="mt-4 font-caption text-[8px] uppercase tracking-[0.12em] text-[#f24f09]">{day.status}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_260px]">
        <div className="rounded-md border border-[#dedbd4] bg-[#151515] p-3 text-white">
          <MealPrepPlanner admin />
        </div>
        <aside className="rounded-md border border-[#dedbd4] bg-white p-4">
          <div className="flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-[#f24f09]" />
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Prep checklist</p>
          </div>
          <div className="mt-4 space-y-2">
            {prepChecklist.map((item) => (
              <div key={item.label} className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
                <p className="font-body text-sm font-semibold text-[#151515]">{item.label}</p>
                <p className="mt-1 font-caption text-[8px] uppercase tracking-[0.12em] text-[#f24f09]">
                  {item.status}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>
    </motion.section>
  );
}

const bookingDateFormatter = new Intl.DateTimeFormat('en-US', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  timeZone: 'America/New_York',
});

const bookingTimeFormatter = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'America/New_York',
});

function formatBookingDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Date pending' : bookingDateFormatter.format(date);
}

function formatBookingTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Time pending' : bookingTimeFormatter.format(date);
}

function bookingStatusLabel(booking: AdminBookingSummary): string {
  if (booking.status === 'pending_payment') return 'Payment pending';
  if (booking.status === 'rescheduled') return 'Rescheduled';
  if (booking.status === 'held') return 'Held';
  if (booking.googleEventId) return 'Calendar ready';
  if (booking.serviceType === 'free') return 'Calendar pending';
  return 'Confirmed';
}

function AppointmentsPanel({
  bookings,
  cancelingBookingId,
  cancelNotice,
  onCancelBooking,
}: {
  bookings: AdminBookingSummary[];
  cancelingBookingId: string | null;
  cancelNotice: string | null;
  onCancelBooking: (bookingId: string) => Promise<void>;
}) {
  const firstFreeSession = bookings.find((booking) => booking.serviceType === 'free');

  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="rounded-md border border-[#dedbd4] bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Live bookings</p>
            <h2 className="mt-1 font-section text-4xl leading-none">Appointment command</h2>
          </div>
          <button
            type="button"
            aria-label="Add appointment"
            className="ios-pill inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dedbd4]"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {cancelNotice ? (
          <p className="mb-3 rounded-md border border-[#dedbd4] bg-[#fbfaf8] p-3 font-body text-xs leading-relaxed text-[#6d675f]">
            {cancelNotice}
          </p>
        ) : null}

        {firstFreeSession ? (
          <article className="mb-4 rounded-md border border-[#f24f09]/35 bg-[#fff3ec] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <CalendarClock className="h-4 w-4 text-[#f24f09]" />
                  <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#f24f09]">
                    Free first session booked
                  </p>
                </div>
                <h3 className="mt-2 font-headline text-2xl uppercase leading-none">
                  {clientNameFromBooking(firstFreeSession)}
                </h3>
                {firstFreeSession.clientEmail ? (
                  <p className="mt-1 font-body text-xs text-[#6d675f]">{firstFreeSession.clientEmail}</p>
                ) : null}
              </div>
              <div className="rounded-md bg-white px-3 py-2 text-right">
                <p className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">
                  {formatBookingDate(firstFreeSession.startsAt)}
                </p>
                <p className="mt-1 font-headline text-lg uppercase text-[#151515]">
                  {formatBookingTime(firstFreeSession.startsAt)}
                </p>
              </div>
            </div>
          </article>
        ) : null}

        <div className="space-y-2">
          {bookings.length === 0 ? (
            <article className="rounded-md border border-dashed border-[#dedbd4] bg-[#fbfaf8] p-6 text-center">
              <p className="font-headline text-xl uppercase text-[#151515]">No live bookings yet</p>
              <p className="mt-2 font-body text-sm text-[#6d675f]">
                Confirmed sessions from the client booking flow will appear here.
              </p>
            </article>
          ) : (
            bookings.map((booking) => (
              <article
                key={booking.id}
                className="grid gap-3 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3 sm:grid-cols-[120px_1fr_auto] sm:items-center"
              >
                <div>
                  <p className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">
                    {formatBookingDate(booking.startsAt)}
                  </p>
                  <p className="mt-1 font-headline text-lg uppercase">{formatBookingTime(booking.startsAt)}</p>
                </div>
                <div>
                  <h3 className="font-body text-sm font-semibold">{clientNameFromBooking(booking)}</h3>
                  <p className="font-body text-xs text-[#6d675f]">
                    {booking.serviceLabel} · {booking.durationMinutes} min
                  </p>
                  {booking.clientEmail ? (
                    <p className="mt-1 font-body text-[11px] text-[#817b72]">{booking.clientEmail}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <span className="ios-pill inline-flex min-h-10 items-center justify-center rounded-full bg-[#151515] px-4 text-center font-caption text-[9px] uppercase tracking-[0.13em] text-white">
                    {bookingStatusLabel(booking)}
                  </span>
                  <button
                    type="button"
                    onClick={() => void onCancelBooking(booking.id)}
                    disabled={cancelingBookingId === booking.id}
                    className="ios-pill inline-flex h-10 w-10 items-center justify-center rounded-full border border-[#dedbd4] bg-white text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Cancel appointment for ${clientNameFromBooking(booking)}`}
                    title="Cancel appointment"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                  </button>
                </div>
              </article>
            ))
          )}
        </div>
      </div>
    </motion.section>
  );
}
