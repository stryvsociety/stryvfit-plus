'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  ChefHat,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Flame,
  Inbox,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Ruler,
  Save,
  Search,
  ShoppingCart,
  Tag,
  Trash2,
  Utensils,
  UserPlus,
  UsersRound,
  X,
} from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { GoogleScheduler } from '@/components/scheduling/GoogleScheduler';
import { MealPrepPlanner } from '@/components/meals/MealPrepPlanner';
import { SystemHealthPanel } from '@/components/incidents/SystemHealthPanel';
import { AdminShell } from '@/components/admin/AdminShell';
import { FloatingPostToClientButton } from '@/components/admin/FloatingPostToClientButton';
import { usePersistedTheme } from '@/components/ui/ThemeToggle';
import { readClientRequests, type ClientRequest } from '@/lib/clientRequests';
import type { AdminBookingSummary, AdminClientSummary, BookingStatus } from '@/lib/bookings';
import { BOOKING_SERVICES } from '@/lib/bookingServices';
import { combineBookingTzDateAndTime } from '@/lib/bookingAvailability';

export type AdminTab = 'appointments' | 'meals' | 'clients';

const adminTabLabels: Record<AdminTab, string> = {
  appointments: 'Appointments',
  meals: 'Meals',
  clients: 'Clients',
};

type BookingEditPayload = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceType: AdminBookingSummary['serviceType'];
  status: BookingStatus;
  startsAt: string;
  durationMinutes: number;
};

type ClientDraft = {
  fullName: string;
  email: string;
  phone: string;
  height: string;
  bodyType: string;
  focus: string;
  zip: string;
};

type ClientProfileMeta = {
  bodyType: string;
  county: string;
  focus: string;
  height: string;
  zip: string;
};

const emptyClientDraft: ClientDraft = {
  fullName: '',
  email: '',
  phone: '',
  height: '',
  bodyType: 'Body type pending',
  focus: 'Strength',
  zip: '',
};

const bodyTypeOptions = ['Body type pending', 'Lean', 'Athletic', 'Power', 'Recomp', 'Mobility'];
const focusOptions = ['Strength', 'Hypertrophy', 'Fat loss', 'Conditioning', 'Mobility', 'Nutrition'];

function countyFromZip(zip: string): string {
  const clean = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(clean)) return 'County pending';
  if (/^33[0-2]/.test(clean)) return 'Miami-Dade County';
  if (/^333/.test(clean)) return 'Broward County';
  if (/^334/.test(clean)) return 'Palm Beach County';
  if (/^100|^101|^102/.test(clean)) return 'New York County';
  if (/^112/.test(clean)) return 'Kings County';
  if (/^113|^114|^116/.test(clean)) return 'Queens County';
  if (/^900|^901/.test(clean)) return 'Los Angeles County';
  return `ZIP ${clean}`;
}

const emptyClient: AdminClientSummary = {
  id: 'empty-client',
  name: 'No clients yet',
  email: null,
  phone: null,
  status: 'Waiting for signups',
  goal: 'Client profiles will appear here',
  payment: 'No billing yet',
};

const defaultNutritionTarget = {
  calories: 'Set target',
  protein: 'Set target',
  cadence: 'Set cadence',
  note: 'Use this workspace to prepare the next coach-approved meal and training plan.',
  compliance: 'Review',
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

function clientNameFromBooking(booking: AdminBookingSummary): string {
  return booking.clientName?.trim() || booking.clientEmail?.trim() || 'StryvFit+ client';
}

function clientRosterKey(email: string | null | undefined, name: string): string {
  return (email?.trim().toLowerCase() || name.trim().toLowerCase()).replace(/\s+/g, ' ');
}

function clientMetaKey(client: AdminClientSummary): string {
  return clientRosterKey(client.email, client.name);
}

function metaFromDraft(draft: ClientDraft): ClientProfileMeta {
  return {
    bodyType: draft.bodyType || 'Body type pending',
    county: countyFromZip(draft.zip),
    focus: draft.focus || 'Strength',
    height: draft.height.trim() || 'Height pending',
    zip: draft.zip.trim(),
  };
}

function metaForClient(client: AdminClientSummary, meta?: ClientProfileMeta): ClientProfileMeta {
  return {
    bodyType: meta?.bodyType || 'Body type pending',
    county: meta?.county || 'County pending',
    focus: meta?.focus || (client.goal === 'Client profile' ? 'Profile focus' : client.goal),
    height: meta?.height || 'Height pending',
    zip: meta?.zip || '',
  };
}

function upsertClientSummary(clients: AdminClientSummary[], ...nextClients: AdminClientSummary[]): AdminClientSummary[] {
  const byKey = new Map(clients.map((item) => [clientRosterKey(item.email, item.name), item]));
  for (const client of nextClients) {
    byKey.set(clientRosterKey(client.email, client.name), client);
  }
  return [...byKey.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function isStoredClientProfile(client: AdminClientSummary): boolean {
  return client.id !== emptyClient.id && !client.id.startsWith('booking:');
}

function clientNeedsAttention(client: AdminClientSummary): boolean {
  const status = client.status.toLowerCase();
  const goal = client.goal.toLowerCase();
  const payment = client.payment.toLowerCase();
  return (
    !client.email ||
    !client.phone ||
    status.includes('waiting') ||
    status.includes('onboarding') ||
    goal.includes('profile') ||
    payment.includes('no billing')
  );
}

function ClientQueueChip({
  active,
  attention,
  client,
  onSelect,
}: {
  active: boolean;
  attention: boolean;
  client: AdminClientSummary;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative w-full rounded-md border p-3 text-left transition ${
        active
          ? 'border-[#f24f09] bg-[#fff3ec]'
          : attention
            ? 'border-[#d12f1b]/45 bg-[#fff7f3] hover:border-[#d12f1b]'
            : 'border-[#e6e2da] bg-[#fbfaf8] hover:border-[#f24f09]/50'
      }`}
    >
      {attention ? (
        <AlertTriangle className="absolute right-2 top-2 h-4 w-4 text-[#d12f1b]" strokeWidth={1.8} />
      ) : null}
      <span className="block pr-6 font-headline text-base uppercase leading-none">{client.name}</span>
      <span className="mt-1 block truncate font-body text-xs text-[#6d675f]">{client.goal}</span>
      <span
        className={`mt-3 inline-flex rounded-sm px-2 py-1 font-caption text-[8px] uppercase tracking-[0.12em] ${
          attention ? 'bg-[#d12f1b] text-white' : 'bg-[#151515] text-white'
        }`}
      >
        {attention ? 'Needs info' : client.status}
      </span>
    </button>
  );
}

function AddClientHeaderAction({
  adding,
  draft,
  notice,
  onSubmit,
  onToggle,
  onUpdate,
  open,
}: {
  adding: boolean;
  draft: ClientDraft;
  notice: string | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onToggle: () => void;
  onUpdate: (patch: Partial<ClientDraft>) => void;
  open: boolean;
}) {
  return (
    <div className="relative">
      <motion.button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        whileHover={{ y: -1 }}
        whileTap={{ scale: 0.97 }}
        className="ios-pill inline-flex min-h-11 items-center gap-2 rounded-full border border-[#f24f09] px-5 font-caption text-[10px] uppercase tracking-[0.14em] text-current transition hover:bg-[#f24f09] hover:text-white"
      >
        <UserPlus className="h-4 w-4" strokeWidth={1.7} />
        Add client
      </motion.button>
      <AnimatePresence>
        {open ? (
          <motion.form
            onSubmit={onSubmit}
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="absolute right-0 top-14 z-50 w-[min(28rem,calc(100vw-2rem))] rounded-md border border-[#dedbd4] bg-white p-3 text-[#151515] shadow-[0_24px_80px_rgba(21,21,21,0.24)]"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-[#f24f09]">New client</p>
                <h2 className="mt-1 font-headline text-xl uppercase leading-none">Profile intake</h2>
              </div>
              <button
                type="button"
                onClick={onToggle}
                aria-label="Close add client form"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dedbd4] text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09]"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="block">
                <span className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">Name</span>
                <input
                  value={draft.fullName}
                  onChange={(event) => onUpdate({ fullName: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                  placeholder="Client name"
                />
              </label>
              <label className="block">
                <span className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">Email</span>
                <input
                  value={draft.email}
                  onChange={(event) => onUpdate({ email: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                  placeholder="client@email.com"
                />
              </label>
              <label className="block">
                <span className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">Number</span>
                <input
                  value={draft.phone}
                  onChange={(event) => onUpdate({ phone: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                  placeholder="Mobile number"
                />
              </label>
              <label className="block">
                <span className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">Height</span>
                <input
                  value={draft.height}
                  onChange={(event) => onUpdate({ height: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                  placeholder="5'10"
                />
              </label>
              <label className="block">
                <span className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">Body type</span>
                <select
                  value={draft.bodyType}
                  onChange={(event) => onUpdate({ bodyType: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                >
                  {bodyTypeOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">Focus</span>
                <select
                  value={draft.focus}
                  onChange={(event) => onUpdate({ focus: event.target.value })}
                  className="mt-1 min-h-10 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                >
                  {focusOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block sm:col-span-2">
                <span className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">ZIP</span>
                <input
                  value={draft.zip}
                  onChange={(event) => onUpdate({ zip: event.target.value })}
                  inputMode="numeric"
                  className="mt-1 min-h-10 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                  placeholder="Auto-tags county"
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-[#fbfaf8] px-3 py-2 font-caption text-[8px] uppercase tracking-[0.12em] text-[#6d675f]">
                <MapPin className="h-3.5 w-3.5 text-[#f24f09]" />
                {countyFromZip(draft.zip)}
              </span>
              <button
                type="submit"
                disabled={adding}
                className="ios-pill inline-flex min-h-10 items-center gap-2 rounded-full bg-[#151515] px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-white disabled:opacity-50"
              >
                <Plus className="h-4 w-4" strokeWidth={1.8} />
                {adding ? 'Adding' : 'Add client'}
              </button>
            </div>
            {notice ? <p className="mt-2 font-body text-xs leading-relaxed text-[#6d675f]">{notice}</p> : null}
          </motion.form>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function TrainerOpsStudio({
  initialBookings = [],
  initialClients = [],
  initialTab = 'appointments',
}: {
  initialBookings?: AdminBookingSummary[];
  initialClients?: AdminClientSummary[];
  initialTab?: AdminTab;
}) {
  const [tab, setTab] = useState<AdminTab>(initialTab);
  const [bookings, setBookings] = useState<AdminBookingSummary[]>(initialBookings);
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [postPending, setPostPending] = useState(false);
  const [posted, setPosted] = useState(false);
  const [theme, setTheme] = usePersistedTheme('stryvadmin-theme', 'light');
  const [clientSearch, setClientSearch] = useState('');
  const [clientRailOpen, setClientRailOpen] = useState(false);
  const [healthOpen, setHealthOpen] = useState(false);
  const [createdClients, setCreatedClients] = useState<AdminClientSummary[]>([]);
  const [deletedClientIds, setDeletedClientIds] = useState<string[]>([]);
  const [clientDraft, setClientDraft] = useState<ClientDraft>(emptyClientDraft);
  const [clientMeta, setClientMeta] = useState<Record<string, ClientProfileMeta>>({});
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [addingClient, setAddingClient] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const baseClients = useMemo(
    () =>
      upsertClientSummary(
        initialClients.filter((client) => !deletedClientIds.includes(client.id)),
        ...createdClients.filter((client) => !deletedClientIds.includes(client.id))
      ),
    [createdClients, deletedClientIds, initialClients]
  );
  const clients = baseClients;
  const [selectedClient, setSelectedClient] = useState(() => initialClients[0]?.name ?? '');
  const filteredClients = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    if (!query) return clients;

    return clients.filter((client) =>
      [client.name, client.email, client.phone, client.status, client.goal, client.payment]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(query)
    );
  }, [clientSearch, clients]);
  const selected = useMemo(
    () => clients.find((client) => client.name === selectedClient) ?? clients[0] ?? emptyClient,
    [clients, selectedClient]
  );
  const queueClients = useMemo(
    () => filteredClients.filter((client) => client.name !== selected.name && !clientNeedsAttention(client)),
    [filteredClients, selected.name]
  );
  const attentionClients = useMemo(
    () => filteredClients.filter((client) => client.name !== selected.name && clientNeedsAttention(client)),
    [filteredClients, selected.name]
  );

  function selectTab(nextTab: AdminTab) {
    setTab(nextTab);
    const nextPath = nextTab === 'appointments' ? '/admin/pulse' : `/admin/pulse?tab=${nextTab}`;
    window.history.replaceState(null, '', nextPath);
  }

  function markPostPending() {
    setPostPending(true);
    setPosted(false);
  }

  function publishPlan() {
    setPostPending(false);
    setPosted(true);
    window.setTimeout(() => setPosted(false), 1800);
  }

  async function cancelBookingById(bookingId: string) {
    setCancelingBookingId(bookingId);
    setCancelNotice(null);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, { method: 'DELETE' });
      const payload = (await response.json().catch(() => null)) as { error?: string; calendarWarning?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to cancel booking');

      setBookings((current) => current.filter((booking) => booking.id !== bookingId));
      markPostPending();
      setCancelNotice(
        payload?.calendarWarning
          ? `Appointment canceled locally. ${payload.calendarWarning}`
          : 'Appointment canceled. Client profile kept.'
      );
    } catch (error) {
      setCancelNotice(error instanceof Error ? error.message : 'Unable to cancel booking');
    } finally {
      setCancelingBookingId(null);
    }
  }

  async function updateBookingById(bookingId: string, draft: BookingEditPayload) {
    setUpdatingBookingId(bookingId);
    setCancelNotice(null);
    try {
      const response = await fetch(`/api/admin/bookings/${bookingId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const payload = (await response.json().catch(() => null)) as {
        booking?: AdminBookingSummary;
        error?: string;
        calendarWarning?: string;
      } | null;
      if (!response.ok || !payload?.booking) throw new Error(payload?.error ?? 'Unable to update appointment');

      setBookings((current) =>
        current.map((booking) => (booking.id === bookingId ? payload.booking ?? booking : booking))
      );
      markPostPending();
      setCancelNotice(payload.calendarWarning ? `Appointment updated. ${payload.calendarWarning}` : 'Appointment updated.');
    } catch (error) {
      setCancelNotice(error instanceof Error ? error.message : 'Unable to update appointment');
      throw error;
    } finally {
      setUpdatingBookingId(null);
    }
  }

  async function addClient(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (addingClient) return;

    setAddingClient(true);
    setClientNotice(null);
    try {
      const response = await fetch('/api/admin/clients', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...clientDraft, existingClient: true }),
      });
      const payload = (await response.json().catch(() => null)) as {
        client?: AdminClientSummary;
        error?: string;
      } | null;
      if (!response.ok || !payload?.client) throw new Error(payload?.error ?? 'Unable to add client');

      setCreatedClients((current) => upsertClientSummary(current, payload.client as AdminClientSummary));
      setSelectedClient(payload.client.name);
      setClientMeta((current) => ({
        ...current,
        [clientMetaKey(payload.client as AdminClientSummary)]: metaFromDraft(clientDraft),
      }));
      setClientDraft(emptyClientDraft);
      setClientSearch('');
      setAddClientOpen(false);
      setClientRailOpen(false);
      markPostPending();
      setClientNotice('Client added. They can sign in with this email.');
    } catch (error) {
      setClientNotice(error instanceof Error ? error.message : 'Unable to add client');
    } finally {
      setAddingClient(false);
    }
  }

  async function removeClientById(client: AdminClientSummary) {
    if (!isStoredClientProfile(client) || deletingClientId) return;

    setDeletingClientId(client.id);
    setClientNotice(null);
    try {
      const response = await fetch('/api/admin/clients', {
        method: 'DELETE',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: client.id }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? 'Unable to remove client');

      setDeletedClientIds((current) => (current.includes(client.id) ? current : [...current, client.id]));
      setCreatedClients((current) => current.filter((item) => item.id !== client.id));
      markPostPending();
      setClientNotice(`${client.name} profile removed. Existing appointments stay on the calendar.`);
    } catch (error) {
      setClientNotice(error instanceof Error ? error.message : 'Unable to remove client');
    } finally {
      setDeletingClientId(null);
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
    if (clients.length === 0) {
      if (selectedClient) setSelectedClient('');
      return;
    }

    if (!clients.some((client) => client.name === selectedClient)) {
      setSelectedClient(clients[0].name);
    }
  }, [clients, selectedClient]);

  return (
    <AdminShell
      active={tab}
      breadcrumbs={[{ label: 'Admin', href: '/admin/pulse' }, { label: adminTabLabels[tab] }]}
      onAppointments={() => selectTab('appointments')}
      onClients={() => selectTab('clients')}
      onMeals={() => selectTab('meals')}
      onThemeChange={setTheme}
      theme={theme}
      title={adminTabLabels[tab]}
      actions={
        <>
          <AddClientHeaderAction
            adding={addingClient}
            draft={clientDraft}
            open={addClientOpen}
            notice={clientNotice}
            onSubmit={addClient}
            onToggle={() => setAddClientOpen((open) => !open)}
            onUpdate={(patch) => setClientDraft((current) => ({ ...current, ...patch }))}
          />
        </>
      }
    >
      <div className="relative">
        <button
          type="button"
          data-testid="admin-client-rail-toggle"
          onClick={() => setClientRailOpen((open) => !open)}
          aria-expanded={clientRailOpen}
          className="fixed right-4 top-44 z-40 hidden translate-x-1/2 rotate-90 items-center gap-2 rounded-t-md border border-[#dedbd4] bg-[#151515] px-4 py-2 font-caption text-[10px] uppercase tracking-[0.14em] text-white shadow-[0_16px_42px_rgba(21,21,21,0.22)] transition hover:bg-[#f24f09] lg:inline-flex"
        >
          <UsersRound className="h-4 w-4" strokeWidth={1.8} />
          Clients
        </button>
        <button
          type="button"
          data-testid="admin-client-rail-toggle-mobile"
          onClick={() => setClientRailOpen((open) => !open)}
          aria-expanded={clientRailOpen}
          className="mb-4 inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dedbd4] bg-white px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-[#151515] lg:hidden"
        >
          <UsersRound className="h-4 w-4 text-[#f24f09]" strokeWidth={1.8} />
          Clients
        </button>
        <AnimatePresence>
          {clientRailOpen ? (
            <motion.aside
              data-testid="admin-client-rail"
              initial={{ opacity: 0, x: 18 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 18 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="fixed bottom-5 right-4 top-36 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto rounded-md border border-[#dedbd4] bg-[#fbfaf8] p-3 shadow-[0_24px_80px_rgba(21,21,21,0.22)] lg:right-8"
            >
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#f24f09]">Clients</p>
                  <h2 className="mt-1 font-headline text-2xl uppercase leading-none">Client rail</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setClientRailOpen(false)}
                  aria-label="Close clients rail"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#dedbd4] bg-white text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09]"
                >
                  <X className="h-4 w-4" strokeWidth={1.8} />
                </button>
              </div>
              <section className="rounded-md border border-[#dedbd4] bg-white p-3">
                <label className="flex min-h-10 items-center gap-2 rounded-md border border-[#dedbd4] px-3">
                  <Search className="h-4 w-4 text-[#817b72]" />
                  <input
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    disabled={clients.length === 0}
                    className="min-w-0 flex-1 bg-transparent font-body text-sm outline-none"
                    placeholder="Search queue"
                  />
                </label>

                <div className="mt-3 rounded-md border border-[#f24f09]/35 bg-[#fff3ec] p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#f24f09]">Next up</p>
                      <h3 className="mt-1 truncate font-headline text-xl uppercase leading-none">{selected.name}</h3>
                      <p className="mt-1 truncate font-body text-xs text-[#6d675f]">{selected.goal}</p>
                    </div>
                    {clientNeedsAttention(selected) ? (
                      <AlertTriangle className="h-4 w-4 flex-none text-[#d12f1b]" strokeWidth={1.8} />
                    ) : null}
                  </div>
                  <dl className="mt-3 grid gap-2">
                    {[
                      ['Session', selected.status],
                      ['Billing', selected.payment],
                      ['Mobile', selected.phone ?? 'Missing'],
                    ].map(([label, value]) => (
                      <div key={label} className="flex items-center justify-between rounded-md bg-white px-2 py-1.5">
                        <dt className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">{label}</dt>
                        <dd className="font-body text-[11px] text-[#151515]">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="mt-3">
                  <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Queue</p>
                  <div className="mt-2 space-y-2">
                    {queueClients.length === 0 ? (
                      <p className="rounded-md border border-dashed border-[#dedbd4] bg-[#fbfaf8] p-3 font-body text-xs text-[#6d675f]">
                        No other clients match this view.
                      </p>
                    ) : (
                      queueClients.map((client) => (
                        <ClientQueueChip
                          key={`${client.id}:${client.email ?? client.name}`}
                          client={client}
                          active={selectedClient === client.name}
                          attention={false}
                          onSelect={() => setSelectedClient(client.name)}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#d12f1b]">Needs attention</p>
                  <div className="mt-2 space-y-2">
                    {attentionClients.length === 0 ? (
                      <p className="rounded-md border border-dashed border-[#dedbd4] bg-[#fbfaf8] p-3 font-body text-xs text-[#6d675f]">
                        No flagged clients in this queue.
                      </p>
                    ) : (
                      attentionClients.map((client) => (
                        <ClientQueueChip
                          key={`${client.id}:${client.email ?? client.name}`}
                          client={client}
                          active={selectedClient === client.name}
                          attention
                          onSelect={() => setSelectedClient(client.name)}
                        />
                      ))
                    )}
                  </div>
                </div>
              </section>
              <section className="mt-3 rounded-md border border-[#dedbd4] bg-white p-3">
                <button
                  type="button"
                  onClick={() => setHealthOpen((open) => !open)}
                  className="flex min-h-10 w-full items-center justify-between gap-3 rounded-md border border-[#dedbd4] px-3 text-left font-caption text-[10px] uppercase tracking-[0.14em] text-[#151515]"
                >
                  System health
                  {healthOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <AnimatePresence>
                  {healthOpen ? (
                    <motion.div
                      initial={{ opacity: 0, y: -8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -8 }}
                      transition={{ duration: 0.18, ease: 'easeOut' }}
                      className="mt-3 rounded-md border border-[#dedbd4] bg-[#fbfaf8] p-2"
                    >
                      <SystemHealthPanel compact />
                    </motion.div>
                  ) : null}
                </AnimatePresence>
              </section>
            </motion.aside>
          ) : null}
        </AnimatePresence>

        <section className="grid gap-5">

          <section className="min-w-0">
            <AnimatePresence mode="wait">
              {tab === 'appointments' ? (
                <AppointmentsPanel
                  key="appointments"
                  bookings={bookings}
                  cancelingBookingId={cancelingBookingId}
                  updatingBookingId={updatingBookingId}
                  cancelNotice={cancelNotice}
                  selectedClientName={selected.name}
                  onCancelBooking={cancelBookingById}
                  onDirty={markPostPending}
                  onUpdateBooking={updateBookingById}
                />
              ) : null}
              {tab === 'meals' ? (
                <MealsPanel key="meals" selectedClient={selected.name} onPlanChange={markPostPending} />
              ) : null}
              {tab === 'clients' ? (
                <ClientsPanel
                  key="clients"
                  clients={clients}
                  clientMeta={clientMeta}
                  clientNotice={clientNotice}
                  deletingClientId={deletingClientId}
                  selectedClient={selected}
                  selectedClientName={selectedClient}
                  onRemoveClient={removeClientById}
                  onSelectClient={setSelectedClient}
                />
              ) : null}
            </AnimatePresence>
          </section>
        </section>
        <FloatingPostToClientButton posted={posted} visible={postPending || posted} onClick={publishPlan} />
      </div>
    </AdminShell>
  );
}

function ClientsPanel({
  clients,
  clientMeta,
  clientNotice,
  deletingClientId,
  onRemoveClient,
  onSelectClient,
  selectedClient,
  selectedClientName,
}: {
  clients: AdminClientSummary[];
  clientMeta: Record<string, ClientProfileMeta>;
  clientNotice: string | null;
  deletingClientId: string | null;
  onRemoveClient: (client: AdminClientSummary) => Promise<void>;
  onSelectClient: (name: string) => void;
  selectedClient: AdminClientSummary;
  selectedClientName: string;
}) {
  const [requests, setRequests] = useState<ClientRequest[]>([]);
  const [query, setQuery] = useState('');
  const crmClients = useMemo(() => (clients.length > 0 ? clients : [emptyClient]), [clients]);
  const visibleClients = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return crmClients;
    return crmClients.filter((client) => {
      const meta = metaForClient(client, clientMeta[clientMetaKey(client)]);
      return [client.name, client.email, client.phone, client.status, client.goal, meta.bodyType, meta.focus, meta.county]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [clientMeta, crmClients, query]);
  const selectedMeta = metaForClient(selectedClient, clientMeta[clientMetaKey(selectedClient)]);
  const selectedRequests = requests.filter((request) => request.clientName === selectedClient.name);
  const canRemoveSelected = isStoredClientProfile(selectedClient);

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
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]"
    >
      <section className="min-w-0 rounded-md border border-[#dedbd4] bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#f24f09]">Client CRM</p>
            <h2 className="mt-1 font-section text-4xl leading-none">Profiles</h2>
          </div>
          <label className="flex min-h-11 min-w-[min(22rem,100%)] items-center gap-2 rounded-md border border-[#dedbd4] bg-[#fbfaf8] px-3">
            <Search className="h-4 w-4 text-[#817b72]" strokeWidth={1.7} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent font-body text-sm outline-none"
              placeholder="Search clients, tags, county"
            />
          </label>
        </div>

        <div className="mt-4 overflow-hidden rounded-md border border-[#e6e2da]">
          <div className="grid grid-cols-[1.3fr_0.9fr_0.9fr_0.9fr_80px] gap-3 bg-[#fbfaf8] px-3 py-3 font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">
            <span>Client</span>
            <span>Body</span>
            <span>Focus</span>
            <span>County</span>
            <span className="text-right">Status</span>
          </div>
          <div>
            {visibleClients.map((client) => {
              const active = selectedClientName === client.name;
              const meta = metaForClient(client, clientMeta[clientMetaKey(client)]);
              return (
                <button
                  key={`${client.id}:${client.email ?? client.name}`}
                  type="button"
                  onClick={() => onSelectClient(client.name)}
                  className={`grid w-full grid-cols-[1.3fr_0.9fr_0.9fr_0.9fr_80px] gap-3 px-3 py-3 text-left transition ${
                    active ? 'bg-[#fff3ec]' : 'bg-white hover:bg-[#fbfaf8]'
                  }`}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-headline text-lg uppercase leading-none">{client.name}</span>
                    <span className="mt-1 block truncate font-body text-xs text-[#6d675f]">
                      {client.email ?? 'Email missing'}
                    </span>
                  </span>
                  <span className="self-center rounded-sm bg-[#151515] px-2 py-1 text-center font-caption text-[8px] uppercase tracking-[0.11em] text-white">
                    {meta.bodyType}
                  </span>
                  <span className="self-center rounded-sm bg-[#f2f0eb] px-2 py-1 text-center font-caption text-[8px] uppercase tracking-[0.11em] text-[#151515]">
                    {meta.focus}
                  </span>
                  <span className="self-center rounded-sm bg-[#fbfaf8] px-2 py-1 text-center font-caption text-[8px] uppercase tracking-[0.11em] text-[#6d675f]">
                    {meta.county}
                  </span>
                  <span className="self-center text-right font-caption text-[8px] uppercase tracking-[0.11em] text-[#f24f09]">
                    {clientNeedsAttention(client) ? 'Review' : 'Ready'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {clientNotice ? <p className="mt-3 font-body text-xs leading-relaxed text-[#6d675f]">{clientNotice}</p> : null}
      </section>

      <aside className="rounded-md border border-[#dedbd4] bg-white p-4 lg:sticky lg:top-24 lg:self-start">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Selected</p>
            <h3 className="mt-1 truncate font-section text-3xl leading-none">{selectedClient.name}</h3>
          </div>
          {clientNeedsAttention(selectedClient) ? (
            <AlertTriangle className="h-5 w-5 flex-none text-[#d12f1b]" strokeWidth={1.8} />
          ) : null}
        </div>

        <div className="mt-4 grid gap-2">
          {[
            { icon: Tag, label: 'Body type', value: selectedMeta.bodyType },
            { icon: Flame, label: 'Focus', value: selectedMeta.focus },
            { icon: MapPin, label: 'County', value: selectedMeta.county },
            { icon: Ruler, label: 'Height', value: selectedMeta.height },
            { icon: Phone, label: 'Mobile', value: selectedClient.phone ?? 'Missing' },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center justify-between gap-3 rounded-md bg-[#fbfaf8] px-3 py-2">
                <span className="inline-flex items-center gap-2 font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">
                  <Icon className="h-3.5 w-3.5 text-[#f24f09]" strokeWidth={1.7} />
                  {item.label}
                </span>
                <span className="text-right font-body text-xs text-[#151515]">{item.value}</span>
              </div>
            );
          })}
        </div>

        <section className="mt-4 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
          <div className="flex items-center gap-2">
            <Inbox className="h-4 w-4 text-[#f24f09]" />
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Requests</p>
          </div>
          <div className="mt-3 space-y-2">
            {selectedRequests.length === 0 ? (
              <p className="font-body text-xs leading-relaxed text-[#6d675f]">No open client requests for this profile.</p>
            ) : (
              selectedRequests.slice(0, 3).map((request) => (
                <article key={request.id} className="rounded-md border border-[#e6e2da] bg-white p-3">
                  <p className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#f24f09]">
                    {request.kind === 'meal-plan-change' ? 'Meal change' : 'Trainer note'}
                  </p>
                  <p className="mt-1 line-clamp-3 font-body text-xs leading-relaxed text-[#6d675f]">{request.message}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <button
          type="button"
          onClick={() => void onRemoveClient(selectedClient)}
          disabled={!canRemoveSelected || deletingClientId === selectedClient.id}
          className="ios-pill mt-4 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full border border-[#dedbd4] px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Trash2 className="h-4 w-4" strokeWidth={1.7} />
          {deletingClientId === selectedClient.id ? 'Removing' : 'Delete profile'}
        </button>
      </aside>
    </motion.section>
  );
}

function MealsPanel({ selectedClient, onPlanChange }: { selectedClient: string; onPlanChange: () => void }) {
  const target = defaultNutritionTarget;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="space-y-4"
    >
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

      <section className="relative min-h-[640px] overflow-hidden rounded-md border border-[#dedbd4] bg-[#151515] p-3 text-white">
        <div className="min-h-[610px]">
          <MealPrepPlanner admin clientName={selectedClient} onPlanChange={onPlanChange} />
        </div>
        <aside className="absolute right-4 top-4 z-10 w-[min(18rem,calc(100%-2rem))] rounded-md border border-[#dedbd4] bg-white/95 p-4 text-[#151515] shadow-[0_18px_52px_rgba(0,0,0,0.24)] backdrop-blur">
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
  if (booking.source === 'google_calendar') return 'Calendar import';
  if (booking.status === 'pending_payment') return 'Payment pending';
  if (booking.status === 'rescheduled') return 'Rescheduled';
  if (booking.status === 'held') return 'Held';
  if (booking.googleEventId) return 'Calendar ready';
  if (booking.serviceType === 'free') return 'Calendar pending';
  return 'Confirmed';
}

type BookingEditDraft = {
  clientName: string;
  clientEmail: string;
  clientPhone: string;
  serviceType: AdminBookingSummary['serviceType'];
  status: BookingStatus;
  date: string;
  time: string;
  durationMinutes: number;
};

const editableStatuses: BookingStatus[] = ['held', 'pending_payment', 'confirmed', 'rescheduled', 'completed', 'no_show'];
const bookingDateInputFormatter = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/New_York',
});
const bookingTimeInputFormatter = new Intl.DateTimeFormat('en-US', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'America/New_York',
});

function dateInputValue(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : bookingDateInputFormatter.format(date);
}

function timeInputValue(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '09:00' : bookingTimeInputFormatter.format(date);
}

function editDraftFromBooking(booking: AdminBookingSummary): BookingEditDraft {
  return {
    clientName: booking.clientName ?? '',
    clientEmail: booking.clientEmail ?? '',
    clientPhone: booking.clientPhone ?? '',
    serviceType: booking.serviceType,
    status: booking.status,
    date: dateInputValue(booking.startsAt),
    time: timeInputValue(booking.startsAt),
    durationMinutes: booking.durationMinutes,
  };
}

function startsAtFromDraft(draft: BookingEditDraft): string {
  return combineBookingTzDateAndTime(draft.date, draft.time || '09:00').toISOString();
}

type AppointmentView = 'day' | 'week' | 'timeline';

const appointmentDatePartsFormatter = new Intl.DateTimeFormat('en-US', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  timeZone: 'America/New_York',
});

function appointmentDateKey(value: string | Date): string | null {
  const date = typeof value === 'string' ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return null;

  const parts = appointmentDatePartsFormatter.formatToParts(date);
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function AppointmentsPanel({
  bookings,
  cancelingBookingId,
  updatingBookingId,
  cancelNotice,
  selectedClientName,
  onCancelBooking,
  onDirty,
  onUpdateBooking,
}: {
  bookings: AdminBookingSummary[];
  cancelingBookingId: string | null;
  updatingBookingId: string | null;
  cancelNotice: string | null;
  selectedClientName: string;
  onCancelBooking: (bookingId: string) => Promise<void>;
  onDirty: () => void;
  onUpdateBooking: (bookingId: string, draft: BookingEditPayload) => Promise<void>;
}) {
  const [appointmentView, setAppointmentView] = useState<AppointmentView>('day');
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, BookingEditDraft>>({});
  const visibleBookings = useMemo(() => {
    const todayKey = appointmentDateKey(new Date());
    if (!todayKey) return bookings;

    const today = new Date();
    const weekStart = new Date(today);
    weekStart.setHours(0, 0, 0, 0);
    weekStart.setDate(today.getDate() - today.getDay());
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const weekStartKey = appointmentDateKey(weekStart);
    const weekEndKey = appointmentDateKey(weekEnd);

    return bookings.filter((booking) => {
      const bookingKey = appointmentDateKey(booking.startsAt);
      if (!bookingKey) return false;
      if (appointmentView === 'day') return bookingKey === todayKey;
      if (appointmentView === 'week' && weekStartKey && weekEndKey) {
        return bookingKey >= weekStartKey && bookingKey <= weekEndKey;
      }
      return true;
    });
  }, [appointmentView, bookings]);
  const firstFreeSession = visibleBookings.find(
    (booking) => booking.source !== 'google_calendar' && booking.serviceType === 'free'
  );

  function beginEdit(booking: AdminBookingSummary) {
    setEditDrafts((current) => ({ ...current, [booking.id]: current[booking.id] ?? editDraftFromBooking(booking) }));
    setEditingBookingId(booking.id);
  }

  function updateDraft(bookingId: string, patch: Partial<BookingEditDraft>) {
    onDirty();
    setEditDrafts((current) => ({
      ...current,
      [bookingId]: { ...current[bookingId], ...patch },
    }));
  }

  async function saveEdit(bookingId: string) {
    const draft = editDrafts[bookingId];
    if (!draft) return;

    try {
      await onUpdateBooking(bookingId, {
        clientName: draft.clientName,
        clientEmail: draft.clientEmail,
        clientPhone: draft.clientPhone,
        serviceType: draft.serviceType,
        status: draft.status,
        startsAt: startsAtFromDraft(draft),
        durationMinutes: draft.durationMinutes,
      });
      setEditingBookingId(null);
    } catch {
      // The parent action already reports the save error.
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="space-y-4"
    >
      <div className="rounded-md border border-[#dedbd4] bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h2 className="mt-1 font-section text-4xl leading-none">Appointment command</h2>
          </div>
          <div className="inline-flex rounded-full bg-[#fbfaf8] p-1">
            {[
              ['day', 'Day'],
              ['week', 'Week'],
              ['timeline', 'Timeline'],
            ].map(([value, label]) => {
              const active = appointmentView === value;
              return (
                <button
                  key={value}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setAppointmentView(value as AppointmentView)}
                  className={`ios-pill min-h-9 rounded-full px-4 font-caption text-[9px] uppercase tracking-[0.13em] transition ${
                    active
                      ? 'bg-[#151515] text-white'
                      : 'text-[#6d675f] hover:bg-white hover:text-[#151515]'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <AnimatePresence mode="wait">
          {appointmentView === 'timeline' ? (
            <motion.div
              key="timeline"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
            >
              <GoogleScheduler
                title={`StryvFit+ session for ${selectedClientName}`}
                description="Trainer-managed appointment block pushed from StryvAdmin."
                durationMinutes={60}
                variant="timeline"
                manageAvailability
              />
            </motion.div>
          ) : (
            <motion.div
              key={appointmentView}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2, ease: 'easeOut' }}
              className="space-y-3"
            >
              {cancelNotice ? (
                <p className="rounded-md border border-[#dedbd4] bg-[#fbfaf8] p-3 font-body text-xs leading-relaxed text-[#6d675f]">
                  {cancelNotice}
                </p>
              ) : null}

              {firstFreeSession ? (
                <article className="rounded-md border border-[#f24f09]/35 bg-[#fff3ec] p-4">
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
              <p className="font-headline text-xl uppercase text-[#151515]">No appointments yet</p>
              <p className="mt-2 font-body text-sm text-[#6d675f]">
                Confirmed sessions from the client booking flow will appear here.
              </p>
            </article>
          ) : visibleBookings.length === 0 ? (
            <article className="rounded-md border border-dashed border-[#dedbd4] bg-[#fbfaf8] p-6 text-center">
              <p className="font-headline text-xl uppercase text-[#151515]">
                {appointmentView === 'day' ? 'No appointments today' : 'No appointments this week'}
              </p>
              <p className="mt-2 font-body text-sm text-[#6d675f]">
                Switch views or use Timeline to add a new block.
              </p>
            </article>
          ) : (
            visibleBookings.map((booking) => {
              const editing = editingBookingId === booking.id;
              const draft = editDrafts[booking.id] ?? editDraftFromBooking(booking);
              const busy = cancelingBookingId === booking.id || updatingBookingId === booking.id;
              const calendarOnly = booking.source === 'google_calendar';

              return (
                <article key={booking.id} className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
                  <div className="grid gap-3 sm:grid-cols-[120px_1fr_auto] sm:items-center">
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
                      {booking.clientPhone ? (
                        <p className="mt-1 inline-flex items-center gap-1 font-body text-[11px] text-[#817b72]">
                          <Phone className="h-3 w-3" strokeWidth={1.7} />
                          {booking.clientPhone}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                      <span className="ios-pill inline-flex min-h-10 items-center justify-center rounded-full bg-[#151515] px-4 text-center font-caption text-[9px] uppercase tracking-[0.13em] text-white">
                        {bookingStatusLabel(booking)}
                      </span>
                      {calendarOnly ? (
                        <span className="ios-pill inline-flex min-h-10 items-center gap-2 rounded-full border border-[#dedbd4] bg-white px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-[#6d675f]">
                          <CalendarClock className="h-4 w-4" strokeWidth={1.7} />
                          Google Calendar
                        </span>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => beginEdit(booking)}
                            disabled={busy}
                            className="ios-pill inline-flex min-h-10 items-center gap-2 rounded-full border border-[#dedbd4] bg-white px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Pencil className="h-4 w-4" strokeWidth={1.7} />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => void onCancelBooking(booking.id)}
                            disabled={busy}
                            className="ios-pill inline-flex min-h-10 items-center gap-2 rounded-full border border-[#dedbd4] bg-white px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09] disabled:cursor-not-allowed disabled:opacity-50"
                            aria-label={`Cancel appointment for ${clientNameFromBooking(booking)}`}
                          >
                            <Trash2 className="h-4 w-4" strokeWidth={1.7} />
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {editing && !calendarOnly ? (
                    <div className="mt-4 grid gap-3 rounded-md border border-[#dedbd4] bg-white p-3 md:grid-cols-2">
                      <label className="block">
                        <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Client name</span>
                        <input
                          value={draft.clientName}
                          onChange={(event) => updateDraft(booking.id, { clientName: event.target.value })}
                          className="mt-2 min-h-11 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Client email</span>
                        <input
                          value={draft.clientEmail}
                          onChange={(event) => updateDraft(booking.id, { clientEmail: event.target.value })}
                          className="mt-2 min-h-11 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Client mobile</span>
                        <input
                          value={draft.clientPhone}
                          onChange={(event) => updateDraft(booking.id, { clientPhone: event.target.value })}
                          inputMode="tel"
                          className="mt-2 min-h-11 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Date</span>
                        <input
                          type="date"
                          value={draft.date}
                          onChange={(event) => updateDraft(booking.id, { date: event.target.value })}
                          className="mt-2 min-h-11 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Time</span>
                        <input
                          type="time"
                          value={draft.time}
                          onChange={(event) => updateDraft(booking.id, { time: event.target.value })}
                          className="mt-2 min-h-11 w-full rounded-md border border-[#dedbd4] px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        />
                      </label>
                      <label className="block">
                        <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Duration</span>
                        <select
                          value={draft.durationMinutes}
                          onChange={(event) => updateDraft(booking.id, { durationMinutes: Number(event.target.value) })}
                          className="mt-2 min-h-11 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        >
                          {[30, 45, 60, 90, 120].map((minutes) => (
                            <option key={minutes} value={minutes}>
                              {minutes} min
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Service</span>
                        <select
                          value={draft.serviceType}
                          onChange={(event) =>
                            updateDraft(booking.id, {
                              serviceType: event.target.value as AdminBookingSummary['serviceType'],
                            })
                          }
                          className="mt-2 min-h-11 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        >
                          {Object.values(BOOKING_SERVICES).map((service) => (
                            <option key={service.type} value={service.type}>
                              {service.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block">
                        <span className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Status</span>
                        <select
                          value={draft.status}
                          onChange={(event) => updateDraft(booking.id, { status: event.target.value as BookingStatus })}
                          className="mt-2 min-h-11 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                        >
                          {editableStatuses.map((status) => (
                            <option key={status} value={status}>
                              {status.replace(/_/g, ' ')}
                            </option>
                          ))}
                        </select>
                      </label>
                      <div className="flex flex-wrap items-end gap-2 md:justify-end">
                        <button
                          type="button"
                          onClick={() => void saveEdit(booking.id)}
                          disabled={updatingBookingId === booking.id || !draft.date}
                          className="ios-pill inline-flex min-h-11 items-center gap-2 rounded-full bg-[#151515] px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Save className="h-4 w-4" strokeWidth={1.7} />
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingBookingId(null)}
                          disabled={updatingBookingId === booking.id}
                          className="ios-pill inline-flex min-h-11 items-center gap-2 rounded-full border border-[#dedbd4] px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-[#6d675f] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <X className="h-4 w-4" strokeWidth={1.7} />
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </article>
              );
            })
          )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.section>
  );
}
