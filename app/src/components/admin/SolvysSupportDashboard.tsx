'use client';

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ExternalLink,
  Inbox,
  LifeBuoy,
  RefreshCw,
  Search,
  Send,
} from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { AdminSectionNav } from '@/components/admin/AdminSectionNav';
import { AdminSupportChat } from '@/components/admin/AdminSupportChat';
import {
  interpretIncident,
  type AppUpdateRecord,
  type IncidentCategory,
  type IncidentStatus,
  type StoredIncident,
} from '@/lib/incidents';

type SolvysSupportDashboardProps = {
  incidents: StoredIncident[];
  updates: AppUpdateRecord[];
  loadError?: string;
  adminName?: string | null;
};

type SupportFilter = 'all' | IncidentStatus;

const filters: Array<{ id: SupportFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open' },
  { id: 'linear_failed', label: 'Retry' },
  { id: 'filed', label: 'Filed' },
  { id: 'in_progress', label: 'Active' },
  { id: 'resolved', label: 'Resolved' },
];

const timestampFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

function formatTime(value: string | null | undefined): string {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not recorded';
  return timestampFormatter.format(date);
}

function categoryLabel(category: IncidentCategory): string {
  return category
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function SolvysSupportDashboard({
  incidents: initialIncidents,
  updates,
  loadError,
  adminName,
}: SolvysSupportDashboardProps) {
  const [incidents, setIncidents] = useState(initialIncidents);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState<Record<string, 'sending' | 'sent' | 'failed'>>({});
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<SupportFilter>('all');

  const enriched = useMemo(
    () =>
      incidents.map((incident) => ({
        incident,
        interpretation: interpretIncident(incident),
      })),
    [incidents]
  );

  const filtered = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return enriched.filter(({ incident, interpretation }) => {
      const statusMatch = filter === 'all' || incident.status === filter;
      if (!statusMatch) return false;
      if (!normalizedQuery) return true;

      return [
        incident.message,
        incident.route,
        incident.fingerprint,
        incident.linear_issue_identifier,
        interpretation.title,
        interpretation.summary,
        interpretation.routeLabel,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [enriched, filter, query]);

  const openCount = incidents.filter((incident) => incident.status === 'open').length;
  const retryCount = incidents.filter((incident) => incident.status === 'linear_failed').length;
  const filedCount = incidents.filter((incident) => Boolean(incident.linear_issue_url)).length;
  const categoryCounts = enriched.reduce<Record<string, number>>((counts, item) => {
    counts[item.interpretation.category] = (counts[item.interpretation.category] ?? 0) + 1;
    return counts;
  }, {});

  function toggle(id: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function sendToSolvys(id: string) {
    setSending((current) => ({ ...current, [id]: 'sending' }));
    try {
      const response = await fetch(`/api/incidents/${id}/linear`, { method: 'POST' });
      const payload = (await response.json().catch(() => null)) as { incident?: StoredIncident } | null;
      if (!response.ok) throw new Error('Support send failed');

      if (payload?.incident) {
        setIncidents((current) =>
          current.map((incident) => (incident.id === id ? payload.incident ?? incident : incident))
        );
      }
      setSending((current) => ({ ...current, [id]: 'sent' }));
    } catch {
      setSending((current) => ({ ...current, [id]: 'failed' }));
    }
  }

  return (
    <main className="min-h-dvh bg-[#f7f7f5] text-[#151515]">
      <div className="mx-auto grid min-h-dvh max-w-7xl grid-rows-[auto_1fr] px-4 py-4 sm:px-6 lg:px-8">
        <header className="space-y-4 border-b border-[#d9d7d1] pb-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <div className="rounded-md bg-[#151515] px-3 py-2">
                <BrandWordmark className="w-[172px]" />
              </div>
              <div className="min-w-0">
                <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#f24f09]">
                  Solvys Support
                </p>
                <h1 className="mt-1 font-section text-4xl leading-none tracking-normal">
                  Incident queue
                </h1>
              </div>
            </div>
            <a
              href="/admin/solvys-support"
              className="ios-pill inline-flex min-h-11 items-center gap-2 rounded-full border border-[#f24f09] px-5 font-caption text-[10px] uppercase tracking-[0.14em] text-[#151515] transition hover:bg-[#f24f09] hover:text-white"
            >
              <RefreshCw className="h-4 w-4" strokeWidth={1.7} />
              Refresh
            </a>
          </div>
          <AdminSectionNav active="support" />
        </header>

        <section className="grid gap-5 py-5 lg:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-w-0 space-y-4">
            {loadError ? (
              <div className="rounded-md border border-[#f24f09]/30 bg-white p-4">
                <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#f24f09]">
                  Support data unavailable
                </p>
                <p className="mt-2 font-body text-sm leading-relaxed text-[#66615a] [overflow-wrap:anywhere]">
                  {loadError}
                </p>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-4">
              {[
                { label: 'Open', value: openCount, icon: AlertTriangle },
                { label: 'Retry', value: retryCount, icon: Send },
                { label: 'Filed', value: filedCount, icon: CheckCircle2 },
                { label: 'Total', value: incidents.length, icon: Inbox },
              ].map((stat) => {
                const Icon = stat.icon;
                return (
                  <article key={stat.label} className="rounded-md border border-[#dedbd4] bg-white p-4">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">
                        {stat.label}
                      </p>
                      <Icon className="h-4 w-4 text-[#f24f09]" strokeWidth={1.7} />
                    </div>
                    <p className="mt-3 font-section text-4xl leading-none">{stat.value}</p>
                  </article>
                );
              })}
            </div>

            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md border border-[#dedbd4] bg-[#fbfaf8] px-3">
                  <Search className="h-4 w-4 flex-none text-[#817b72]" strokeWidth={1.7} />
                  <input
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    className="min-w-0 flex-1 bg-transparent font-body text-sm outline-none"
                    placeholder="Search issues"
                  />
                </label>
                <div className="flex flex-wrap gap-1">
                  {filters.map((item) => {
                    const active = filter === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setFilter(item.id)}
                        className={`min-h-10 rounded-sm px-3 font-caption text-[9px] uppercase tracking-[0.12em] transition ${
                          active ? 'bg-[#151515] text-white' : 'bg-[#f5f2ed] text-[#6d675f] hover:text-[#f24f09]'
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section className="space-y-3">
              {filtered.length === 0 ? (
                <article className="rounded-md border border-[#dedbd4] bg-white p-8 text-center">
                  <LifeBuoy className="mx-auto h-7 w-7 text-[#f24f09]" strokeWidth={1.7} />
                  <h2 className="mt-3 font-headline text-xl uppercase">No matching issues</h2>
                  <p className="mt-2 font-body text-sm text-[#66615a]">
                    The current filter has nothing waiting.
                  </p>
                </article>
              ) : null}

              {filtered.map(({ incident, interpretation }) => {
                const isExpanded = expanded.has(incident.id);
                const sendState = sending[incident.id] ?? (incident.linear_issue_url ? 'sent' : 'idle');

                return (
                  <article
                    key={incident.id}
                    className="max-w-full overflow-hidden rounded-md border border-[#dedbd4] bg-white p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-[#f24f09]">
                          {categoryLabel(interpretation.category)} · {incident.severity} · {incident.status}
                        </p>
                        <h2 className="mt-1 font-section text-3xl leading-none tracking-normal">
                          {interpretation.title}
                        </h2>
                        <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-[#66615a]">
                          {interpretation.summary}
                        </p>
                        <p className="mt-2 max-w-2xl font-body text-sm leading-relaxed text-[#817b72]">
                          {interpretation.supportNote}
                        </p>
                      </div>
                      <p className="rounded-sm bg-[#f5f2ed] px-2 py-1 font-caption text-[9px] uppercase tracking-[0.12em] text-[#817b72]">
                        Seen {incident.occurrence_count}x
                      </p>
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-3">
                      {[
                        ['Where', interpretation.routeLabel],
                        ['First seen', formatTime(incident.first_seen_at)],
                        ['Last seen', formatTime(incident.last_seen_at)],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
                          <p className="font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">
                            {label}
                          </p>
                          <p className="mt-1 font-body text-xs leading-relaxed text-[#151515] [overflow-wrap:anywhere]">
                            {value}
                          </p>
                        </div>
                      ))}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(incident.id)}
                        className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-[#dedbd4] px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-[#6d675f] transition hover:border-[#f24f09] hover:text-[#f24f09]"
                      >
                        See More
                        <ChevronDown
                          className={`h-4 w-4 transition ${isExpanded ? 'rotate-180' : ''}`}
                          strokeWidth={1.7}
                        />
                      </button>
                      {incident.linear_issue_url ? (
                        <a
                          href={incident.linear_issue_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex min-h-10 items-center gap-2 rounded-sm bg-[#151515] px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-white transition hover:bg-[#f24f09]"
                        >
                          {incident.linear_issue_identifier ?? 'Open Linear'}
                          <ExternalLink className="h-4 w-4" strokeWidth={1.7} />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => void sendToSolvys(incident.id)}
                          disabled={sendState === 'sending'}
                          className="inline-flex min-h-10 items-center gap-2 rounded-sm bg-[#151515] px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-white transition hover:bg-[#f24f09] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Send className="h-4 w-4" strokeWidth={1.7} />
                          {sendState === 'sending'
                            ? 'Sending'
                            : sendState === 'failed'
                              ? 'Retry Solvys'
                              : 'Send to Solvys'}
                        </button>
                      )}
                    </div>

                    {sendState === 'failed' ? (
                      <p className="mt-3 font-body text-xs leading-relaxed text-[#b83a14]">
                        Linear filing failed. The saved ticket can be retried from here.
                      </p>
                    ) : null}

                    {isExpanded ? (
                      <div className="mt-4 rounded-md border border-[#dedbd4] bg-[#fbfaf8] p-3">
                        <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-[#817b72]">
                          Technical details
                        </p>
                        <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-[#151515] [overflow-wrap:anywhere]">
                          {interpretation.technicalSummary}
                        </pre>
                      </div>
                    ) : null}
                  </article>
                );
              })}
            </section>
          </section>

          <aside className="space-y-4">
            <AdminSupportChat clientName={adminName ?? 'StryvAdmin'} />
            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-[#f24f09]" strokeWidth={1.7} />
                <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">
                  Fix log
                </p>
              </div>
              <div className="mt-3 space-y-2">
                {updates.length === 0 ? (
                  <p className="font-body text-sm leading-relaxed text-[#66615a]">
                    No published fixes recorded yet.
                  </p>
                ) : null}
                {updates.map((update) => (
                  <article key={update.id} className="rounded-md border border-[#e6e2da] bg-[#fbfaf8] p-3">
                    <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-[#817b72]">
                      {formatTime(update.published_at)}
                    </p>
                    <p className="mt-1 font-body text-sm leading-relaxed text-[#151515] [overflow-wrap:anywhere]">
                      {update.title}
                    </p>
                    <p className="mt-1 font-body text-xs leading-relaxed text-[#66615a] [overflow-wrap:anywhere]">
                      {update.summary}
                    </p>
                  </article>
                ))}
              </div>
            </section>
            <section className="rounded-md border border-[#dedbd4] bg-white p-4">
              <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">
                Issue types
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(categoryCounts).map(([category, count]) => (
                  <span
                    key={category}
                    className="rounded-sm bg-[#f5f2ed] px-2 py-1 font-caption text-[9px] uppercase tracking-[0.12em] text-[#6d675f]"
                  >
                    {categoryLabel(category as IncidentCategory)} {count}
                  </span>
                ))}
                {Object.keys(categoryCounts).length === 0 ? (
                  <span className="font-body text-sm text-[#66615a]">No incidents categorized.</span>
                ) : null}
              </div>
            </section>
          </aside>
        </section>
      </div>
    </main>
  );
}
