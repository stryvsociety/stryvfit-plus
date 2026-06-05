'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ExternalLink, RefreshCw, Send } from 'lucide-react';
import { interpretIncident, type AppUpdateRecord, type StoredIncident } from '@/lib/incidents';

interface HealthResponse {
  incidents: StoredIncident[];
  updates: AppUpdateRecord[];
  error?: string;
}

export function SystemHealthPanel({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<HealthResponse>({ incidents: [], updates: [] });
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sending, setSending] = useState<Record<string, 'sending' | 'sent' | 'failed'>>({});

  async function loadHealth() {
    setLoading(true);
    try {
      const res = await fetch('/api/incidents', { cache: 'no-store' });
      setHealth((await res.json()) as HealthResponse);
    } catch (error) {
      setHealth({
        incidents: [],
        updates: [],
        error: error instanceof Error ? error.message : 'System health unavailable',
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadHealth();
  }, []);

  function toggleDetails(id: string) {
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
        setHealth((current) => ({
          ...current,
          incidents: current.incidents.map((incident) =>
            incident.id === id ? payload.incident ?? incident : incident
          ),
        }));
      }
      setSending((current) => ({ ...current, [id]: 'sent' }));
    } catch {
      setSending((current) => ({ ...current, [id]: 'failed' }));
    }
  }

  const hasOpen = health.incidents.length > 0;
  const title = health.error ? 'Setup needed' : hasOpen ? 'Needs eyes' : 'All clear';

  if (compact) {
    return (
      <section className="rounded-sm border border-gold/20 bg-surface-2 p-4 shadow-glass">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">System health</p>
            <h2 className="mt-2 font-section text-2xl leading-none tracking-normal text-text">{title}</h2>
          </div>
          <button
            type="button"
            onClick={loadHealth}
            className="rounded-sm border border-border p-2 text-text-muted transition-colors hover:border-gold hover:text-gold"
            aria-label="Refresh system health"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.7} />
          </button>
        </div>

        <div className="mt-3 rounded-sm border border-border bg-bg/70 p-3">
          {health.error ? (
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-gold" strokeWidth={1.7} />
              <p className="font-body text-xs leading-relaxed text-text-muted [overflow-wrap:anywhere]">
                {health.error}
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-2">
              {hasOpen ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-gold" strokeWidth={1.7} />
              ) : (
                <CheckCircle2 className="mt-0.5 h-4 w-4 flex-none text-gold" strokeWidth={1.7} />
              )}
              <p className="font-body text-xs leading-relaxed text-text-muted">
                {hasOpen
                  ? `${health.incidents.length} open incident${health.incidents.length === 1 ? '' : 's'} need review.`
                  : 'No open incidents.'}
              </p>
            </div>
          )}
        </div>

        <a
          href="/admin/solvys-support"
          className="mt-3 inline-flex min-h-9 w-full items-center justify-center gap-2 rounded-sm border border-gold/50 px-3 font-caption text-[9px] uppercase tracking-[0.12em] text-gold transition hover:border-gold"
        >
          Open Support
          <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} />
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-sm border border-gold/20 bg-surface-2 p-4 shadow-glass">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
            System health
          </p>
          <h2 className="mt-2 font-section text-3xl leading-none tracking-normal text-text">{title}</h2>
        </div>
        <button
          type="button"
          onClick={loadHealth}
          className="rounded-sm border border-border p-2 text-text-muted transition-colors hover:border-gold hover:text-gold"
          aria-label="Refresh system health"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} strokeWidth={1.7} />
        </button>
      </div>

      <div className="mt-4 space-y-3">
        {health.error ? (
          <div className="rounded-sm border border-border bg-bg/70 p-3">
            <p className="font-body text-sm leading-relaxed text-text-muted [overflow-wrap:anywhere]">
              {health.error}
            </p>
          </div>
        ) : null}

        {!hasOpen && !health.error ? (
          <div className="flex items-start gap-3 rounded-sm border border-border bg-bg/70 p-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 flex-none text-gold" strokeWidth={1.7} />
            <p className="font-body text-sm text-text-muted">
              No open incidents. New failures auto-file Linear issues and show up here.
            </p>
          </div>
        ) : null}

        {health.incidents.map((incident) => {
          const details = interpretIncident(incident);
          const isExpanded = expanded.has(incident.id);
          const sendState = sending[incident.id] ?? (incident.linear_issue_url ? 'sent' : 'idle');

          return (
            <article
              key={incident.id}
              className="max-w-full overflow-hidden rounded-sm border border-border bg-bg/70 p-3"
            >
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 flex-none text-gold" strokeWidth={1.7} />
                <div className="min-w-0 flex-1">
                  <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim [overflow-wrap:anywhere]">
                    {incident.severity} · {details.routeLabel} · seen {incident.occurrence_count}x
                  </p>
                  <h3 className="mt-1 font-body text-sm font-semibold leading-relaxed text-text">
                    {details.title}
                  </h3>
                  <p className="mt-1 font-body text-xs leading-relaxed text-text-muted">
                    {details.summary}
                  </p>
                  <p className="mt-1 font-body text-xs leading-relaxed text-text-dim">
                    {details.userAction}
                  </p>

                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => toggleDetails(incident.id)}
                      className="inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-border px-2.5 font-caption text-[9px] uppercase tracking-[0.12em] text-text-muted transition hover:border-gold hover:text-gold"
                    >
                      See More
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition ${isExpanded ? 'rotate-180' : ''}`}
                        strokeWidth={1.7}
                      />
                    </button>
                    {incident.linear_issue_url ? (
                      <a
                        href={incident.linear_issue_url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-sm border border-gold/60 px-2.5 font-caption text-[9px] uppercase tracking-[0.12em] text-gold transition hover:border-gold"
                      >
                        {incident.linear_issue_identifier ?? 'Sent to Solvys'}
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.7} />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void sendToSolvys(incident.id)}
                        disabled={sendState === 'sending'}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-sm bg-gold px-2.5 font-caption text-[9px] uppercase tracking-[0.12em] text-bg transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <Send className="h-3.5 w-3.5" strokeWidth={1.7} />
                        {sendState === 'sending'
                          ? 'Sending'
                          : sendState === 'failed'
                            ? 'Retry Solvys'
                            : 'Send to Solvys'}
                      </button>
                    )}
                  </div>

                  {sendState === 'failed' ? (
                    <p className="mt-2 font-body text-xs leading-relaxed text-gold">
                      Solvys send failed. The incident is still saved here.
                    </p>
                  ) : null}

                  {isExpanded ? (
                    <div className="mt-3 max-w-full rounded-sm border border-border bg-surface-2/70 p-3">
                      <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">
                        Technical details
                      </p>
                      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-relaxed text-text-muted [overflow-wrap:anywhere]">
                        {details.technicalSummary}
                      </pre>
                    </div>
                  ) : null}
                </div>
              </div>
            </article>
          );
        })}

        {health.updates.map((update) => (
          <article key={update.id} className="max-w-full overflow-hidden rounded-sm border border-border bg-bg/70 p-3">
            <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">
              Fix published
            </p>
            <p className="mt-1 font-body text-sm leading-relaxed text-text [overflow-wrap:anywhere]">{update.title}</p>
            <p className="mt-1 font-body text-xs leading-relaxed text-text-muted [overflow-wrap:anywhere]">
              {update.summary}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
