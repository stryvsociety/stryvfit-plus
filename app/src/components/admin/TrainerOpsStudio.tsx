'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  ChefHat,
  Check,
  ChevronDown,
  ChevronUp,
  CircleArrowUp,
  ClipboardList,
  Flame,
  Inbox,
  Pencil,
  Phone,
  Plus,
  Save,
  Search,
  ShoppingCart,
  Trash2,
  Utensils,
  UsersRound,
  X,
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
import type { AdminBookingSummary, AdminClientSummary, BookingStatus } from '@/lib/bookings';
import { BOOKING_SERVICES } from '@/lib/bookingServices';
import { combineBookingTzDateAndTime } from '@/lib/bookingAvailability';

type AdminTab = 'appointments' | 'meals' | 'clients';

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
};

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

function clientSummaryFromBooking(booking: AdminBookingSummary): AdminClientSummary {
  return {
    id: `booking:${booking.id}`,
    name: clientNameFromBooking(booking),
    email: booking.clientEmail,
    phone: booking.clientPhone,
    status: booking.serviceType === 'free' ? 'First session booked' : 'Booked',
    goal: booking.serviceLabel,
    payment: booking.status === 'pending_payment' ? 'Payment pending' : 'Active',
  };
}

function buildClientRoster(bookings: AdminBookingSummary[], initialClients: AdminClientSummary[]): AdminClientSummary[] {
  const byName = new Map<string, AdminClientSummary>();

  for (const client of initialClients) {
    byName.set(clientRosterKey(client.email, client.name), client);
  }

  for (const booking of bookings) {
    const bookingClient = clientSummaryFromBooking(booking);
    const key = clientRosterKey(bookingClient.email, bookingClient.name);
    const existing = byName.get(key);

    if (existing) {
      byName.set(key, {
        ...existing,
        status: bookingClient.status,
        goal: bookingClient.goal,
        payment: existing.payment === 'No billing yet' ? bookingClient.payment : existing.payment,
      });
    } else {
      byName.set(key, bookingClient);
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
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

export function TrainerOpsStudio({
  initialBookings = [],
  initialClients = [],
}: {
  initialBookings?: AdminBookingSummary[];
  initialClients?: AdminClientSummary[];
}) {
  const [tab, setTab] = useState<AdminTab>('appointments');
  const [bookings, setBookings] = useState<AdminBookingSummary[]>(initialBookings);
  const [cancelingBookingId, setCancelingBookingId] = useState<string | null>(null);
  const [updatingBookingId, setUpdatingBookingId] = useState<string | null>(null);
  const [cancelNotice, setCancelNotice] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [theme, setTheme] = usePersistedTheme('stryvadmin-theme', 'light');
  const [clientSearch, setClientSearch] = useState('');
  const [clientsOpen, setClientsOpen] = useState(false);
  const [createdClients, setCreatedClients] = useState<AdminClientSummary[]>([]);
  const [deletedClientIds, setDeletedClientIds] = useState<string[]>([]);
  const [clientDraft, setClientDraft] = useState<ClientDraft>({ fullName: '', email: '', phone: '' });
  const [addingClient, setAddingClient] = useState(false);
  const [deletingClientId, setDeletingClientId] = useState<string | null>(null);
  const [clientNotice, setClientNotice] = useState<string | null>(null);
  const isDark = theme === 'dark';
  const baseClients = useMemo(
    () =>
      upsertClientSummary(
        initialClients.filter((client) => !deletedClientIds.includes(client.id)),
        ...createdClients.filter((client) => !deletedClientIds.includes(client.id))
      ),
    [createdClients, deletedClientIds, initialClients]
  );
  const clients = useMemo(() => buildClientRoster(bookings, baseClients), [baseClients, bookings]);
  const [selectedClient, setSelectedClient] = useState(
    () => initialClients[0]?.name ?? (initialBookings[0] ? clientNameFromBooking(initialBookings[0]) : '')
  );
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
      setClientDraft({ fullName: '', email: '', phone: '' });
      setClientSearch('');
      setClientsOpen(false);
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
      setClientsOpen(false);
      return;
    }

    if (!clients.some((client) => client.name === selectedClient)) {
      setSelectedClient(clients[0].name);
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
            <button
              type="button"
              onClick={() => setClientsOpen((open) => !open)}
              disabled={clients.length === 0}
              className="ios-pill flex min-h-11 w-full items-center justify-between gap-3 rounded-md border border-[#dedbd4] px-3 text-left disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span className="flex min-w-0 items-center gap-2">
                <UsersRound className="h-4 w-4 flex-none text-[#f24f09]" />
                <span className="min-w-0">
                  <span className="block font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">
                    Clients
                  </span>
                  <span className="block truncate font-body text-sm text-[#151515]">
                    {clients.length > 0
                      ? `${clients.length} real profile${clients.length === 1 ? '' : 's'}`
                      : 'No clients yet'}
                  </span>
                </span>
              </span>
              {clientsOpen ? (
                <ChevronUp className="h-4 w-4 flex-none" />
              ) : (
                <ChevronDown className="h-4 w-4 flex-none" />
              )}
            </button>
            <label className="mt-3 flex min-h-10 items-center gap-2 rounded-md border border-[#dedbd4] px-3">
              <Search className="h-4 w-4 text-[#817b72]" />
              <input
                value={clientSearch}
                onChange={(event) => setClientSearch(event.target.value)}
                onFocus={() => setClientsOpen(true)}
                disabled={clients.length === 0}
                className="min-w-0 flex-1 bg-transparent font-body text-sm outline-none"
                placeholder="Search clients"
              />
            </label>
            {clientsOpen ? (
              <div className="mt-4 max-h-80 space-y-2 overflow-y-auto pr-1">
                {filteredClients.length === 0 ? (
                  <div className="rounded-md border border-dashed border-[#dedbd4] bg-[#fbfaf8] p-4">
                    <p className="font-body text-sm text-[#6d675f]">No clients match that search.</p>
                  </div>
                ) : (
                  filteredClients.map((client) => {
                    const active = selectedClient === client.name;
                    return (
                      <article
                        key={`${client.id}:${client.email ?? client.name}`}
                        className={`rounded-md border p-3 transition ${
                          active
                            ? 'border-[#f24f09] bg-[#fff3ec]'
                            : 'border-[#e6e2da] bg-[#fbfaf8] hover:border-[#f24f09]/50'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedClient(client.name);
                            setClientsOpen(false);
                          }}
                          className="w-full text-left"
                        >
                          <span className="block font-headline text-base uppercase">{client.name}</span>
                          <span className="mt-1 block font-body text-xs text-[#6d675f]">{client.goal}</span>
                          {client.email ? (
                            <span className="mt-1 block font-body text-[11px] text-[#817b72]">{client.email}</span>
                          ) : null}
                          {client.phone ? (
                            <span className="mt-1 inline-flex items-center gap-1 font-body text-[11px] text-[#817b72]">
                              <Phone className="h-3 w-3" strokeWidth={1.7} />
                              {client.phone}
                            </span>
                          ) : null}
                        </button>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <span className="inline-flex rounded-sm bg-[#151515] px-2 py-1 font-caption text-[8px] uppercase tracking-[0.12em] text-white">
                            {client.status}
                          </span>
                          {isStoredClientProfile(client) ? (
                            <button
                              type="button"
                              onClick={() => void removeClientById(client)}
                              disabled={deletingClientId === client.id}
                              className="inline-flex min-h-8 items-center gap-1 rounded-full border border-[#dedbd4] bg-white px-3 font-caption text-[8px] uppercase tracking-[0.12em] text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09] disabled:cursor-not-allowed disabled:opacity-50"
                              aria-label={`Delete profile for ${client.name}`}
                            >
                              <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                              {deletingClientId === client.id ? 'Removing' : 'Delete profile'}
                            </button>
                          ) : null}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="mt-4 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
                <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Selected</p>
                <p className="mt-1 font-headline text-lg uppercase leading-none">{selected.name}</p>
                <p className="mt-2 font-body text-xs text-[#6d675f]">{selected.goal}</p>
                {selected.email ? <p className="mt-1 font-body text-[11px] text-[#817b72]">{selected.email}</p> : null}
                {selected.phone ? (
                  <p className="mt-1 inline-flex items-center gap-1 font-body text-[11px] text-[#817b72]">
                    <Phone className="h-3 w-3" strokeWidth={1.7} />
                    {selected.phone}
                  </p>
                ) : (
                  <p className="mt-1 font-body text-[11px] text-[#817b72]">Mobile not set</p>
                )}
                {isStoredClientProfile(selected) ? (
                  <button
                    type="button"
                    onClick={() => void removeClientById(selected)}
                    disabled={deletingClientId === selected.id}
                    className="ios-pill mt-3 inline-flex min-h-9 items-center gap-2 rounded-full border border-[#dedbd4] bg-white px-3 font-caption text-[8px] uppercase tracking-[0.12em] text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09] disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Delete profile for ${selected.name}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.7} />
                    {deletingClientId === selected.id ? 'Removing' : 'Delete profile'}
                  </button>
                ) : null}
              </div>
            )}
            <form onSubmit={addClient} className="mt-4 rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
              <div className="flex items-center gap-2">
                <Plus className="h-4 w-4 text-[#f24f09]" strokeWidth={1.7} />
                <p className="font-caption text-[9px] uppercase tracking-[0.13em] text-[#817b72]">Add client</p>
              </div>
              <label className="mt-3 block">
                <span className="sr-only">Client name</span>
                <input
                  value={clientDraft.fullName}
                  onChange={(event) => setClientDraft((draft) => ({ ...draft, fullName: event.target.value }))}
                  className="min-h-10 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                  placeholder="Client name"
                />
              </label>
              <label className="mt-2 block">
                <span className="sr-only">Client email</span>
                <input
                  value={clientDraft.email}
                  onChange={(event) => setClientDraft((draft) => ({ ...draft, email: event.target.value }))}
                  type="email"
                  required
                  className="min-h-10 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                  placeholder="Client email"
                />
              </label>
              <label className="mt-2 block">
                <span className="sr-only">Client mobile number</span>
                <input
                  value={clientDraft.phone}
                  onChange={(event) => setClientDraft((draft) => ({ ...draft, phone: event.target.value }))}
                  inputMode="tel"
                  className="min-h-10 w-full rounded-md border border-[#dedbd4] bg-white px-3 font-body text-sm outline-none focus:border-[#f24f09]"
                  placeholder="Mobile number"
                />
              </label>
              <button
                type="submit"
                disabled={addingClient}
                className="ios-pill mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-full bg-[#151515] px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-white transition hover:bg-[#f24f09] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" strokeWidth={1.7} />
                {addingClient ? 'Adding' : 'Add client'}
              </button>
              {clientNotice ? (
                <p className="mt-2 font-body text-xs leading-relaxed text-[#6d675f]">{clientNotice}</p>
              ) : null}
            </form>
          </aside>

          <section className="min-w-0">
            {tab === 'appointments' ? (
              <AppointmentsPanel
                bookings={bookings}
                cancelingBookingId={cancelingBookingId}
                updatingBookingId={updatingBookingId}
                cancelNotice={cancelNotice}
                onCancelBooking={cancelBookingById}
                onUpdateBooking={updateBookingById}
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
                  ['Mobile', selected.phone ?? 'Not set'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between rounded-md bg-[#f5f2ed] px-3 py-2">
                    <dt className="font-caption text-[9px] uppercase tracking-[0.12em] text-[#817b72]">{label}</dt>
                    <dd className="font-body text-xs text-[#151515]">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
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

          <div className="grid gap-4 lg:col-span-3 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="rounded-md border border-[#dedbd4] bg-white p-2">
              <SystemHealthPanel compact />
            </div>
            <AdminSupportChat clientName={selected.name} />
          </div>
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
  const target = defaultNutritionTarget;

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
          <MealPrepPlanner admin clientName={selectedClient} />
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

function AppointmentsPanel({
  bookings,
  cancelingBookingId,
  updatingBookingId,
  cancelNotice,
  onCancelBooking,
  onUpdateBooking,
}: {
  bookings: AdminBookingSummary[];
  cancelingBookingId: string | null;
  updatingBookingId: string | null;
  cancelNotice: string | null;
  onCancelBooking: (bookingId: string) => Promise<void>;
  onUpdateBooking: (bookingId: string, draft: BookingEditPayload) => Promise<void>;
}) {
  const firstFreeSession = bookings.find((booking) => booking.serviceType === 'free');
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<Record<string, BookingEditDraft>>({});

  function beginEdit(booking: AdminBookingSummary) {
    setEditDrafts((current) => ({ ...current, [booking.id]: current[booking.id] ?? editDraftFromBooking(booking) }));
    setEditingBookingId(booking.id);
  }

  function updateDraft(bookingId: string, patch: Partial<BookingEditDraft>) {
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
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
      <div className="rounded-md border border-[#dedbd4] bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Live bookings</p>
            <h2 className="mt-1 font-section text-4xl leading-none">Appointment command</h2>
          </div>
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
            bookings.map((booking) => {
              const editing = editingBookingId === booking.id;
              const draft = editDrafts[booking.id] ?? editDraftFromBooking(booking);
              const busy = cancelingBookingId === booking.id || updatingBookingId === booking.id;

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
                    </div>
                  </div>

                  {editing ? (
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
      </div>
    </motion.section>
  );
}
