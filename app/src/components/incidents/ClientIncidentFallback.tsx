'use client';

import { useMemo, useState } from 'react';
import { AlertTriangle, ChevronDown, Send } from 'lucide-react';
import { interpretIncident, type IncidentSource, type IncidentSeverity } from '@/lib/incidents';
import { reportIncident } from '@/lib/reportIncident';

type ClientIncidentFallbackProps = {
  source?: IncidentSource;
  severity?: IncidentSeverity;
  route?: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
  autoFiled?: boolean;
};

export function ClientIncidentFallback({
  source = 'client',
  severity = 'high',
  route = typeof window === 'undefined' ? '/' : `${window.location.pathname}${window.location.search}`,
  message,
  stack,
  context,
  autoFiled = false,
}: ClientIncidentFallbackProps) {
  const [expanded, setExpanded] = useState(false);
  const [sendState, setSendState] = useState<'idle' | 'sending' | 'sent' | 'failed'>(
    autoFiled ? 'sent' : 'idle'
  );
  const interpretation = useMemo(
    () => interpretIncident({ source, severity, route, message, stack, context }),
    [context, message, route, severity, source, stack]
  );

  async function sendToSolvys() {
    setSendState('sending');
    try {
      await reportIncident({
        source,
        severity,
        message,
        stack,
        context: {
          ...context,
          manuallySentToSolvys: true,
          plainLanguageTitle: interpretation.title,
          plainLanguageSummary: interpretation.summary,
        },
        admin_action: 'User clicked Send to Solvys from the plain-language error screen.',
      });
      setSendState('sent');
    } catch {
      setSendState('failed');
    }
  }

  return (
    <main className="min-h-dvh bg-bg px-5 py-10 text-text">
      <section className="mx-auto max-w-md rounded-md border border-gold/20 bg-surface-2 p-5 shadow-glass">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-1 h-5 w-5 flex-none text-gold" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-gold">
              Help is ready
            </p>
            <h1 className="mt-2 font-section text-3xl leading-none tracking-normal">
              {interpretation.title}
            </h1>
            <p className="mt-3 font-body text-sm leading-relaxed text-text-muted">
              {interpretation.summary}
            </p>
            <p className="mt-2 font-body text-sm leading-relaxed text-text-muted">
              {interpretation.userAction}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            className="inline-flex min-h-10 items-center gap-2 rounded-sm border border-border px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-text-muted transition hover:border-gold hover:text-gold"
          >
            See More
            <ChevronDown className={`h-4 w-4 transition ${expanded ? 'rotate-180' : ''}`} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            onClick={sendToSolvys}
            disabled={sendState === 'sending'}
            className="inline-flex min-h-10 items-center gap-2 rounded-sm bg-gold px-4 font-caption text-[10px] uppercase tracking-[0.14em] text-bg transition hover:bg-gold-light disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Send className="h-4 w-4" strokeWidth={1.7} />
            {sendState === 'sending' ? 'Sending' : sendState === 'sent' ? 'Sent to Solvys' : 'Send to Solvys'}
          </button>
        </div>

        {sendState === 'failed' ? (
          <p className="mt-3 font-body text-xs leading-relaxed text-gold">
            Could not send from this screen. Refresh once; the admin support dashboard can still retry it.
          </p>
        ) : null}

        {expanded ? (
          <div className="mt-4 rounded-sm border border-border bg-bg/70 p-3">
            <p className="font-caption text-[9px] uppercase tracking-[0.14em] text-text-dim">
              Technical details
            </p>
            <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-text-muted [overflow-wrap:anywhere]">
              {interpretation.technicalSummary}
            </pre>
          </div>
        ) : null}
      </section>
    </main>
  );
}
