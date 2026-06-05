'use client';

import {
  type IncidentPayload,
  type IncidentSeverity,
  type IncidentSource,
  fingerprintIncident,
  interpretIncident,
} from '@/lib/incidents';

type Context = Record<string, unknown>;

function route(): string {
  if (typeof window === 'undefined') return '/';
  return `${window.location.pathname}${window.location.search}`;
}

export async function reportIncident(input: {
  source: IncidentSource;
  message: string;
  severity?: IncidentSeverity;
  stack?: string;
  context?: Context;
  admin_action?: string;
}) {
  const currentRoute = route();
  const payload: IncidentPayload = {
    source: input.source,
    route: currentRoute,
    message: input.message,
    severity: input.severity ?? 'medium',
    fingerprint: fingerprintIncident({
      source: input.source,
      route: currentRoute,
      message: input.message,
    }),
    stack: input.stack,
    admin_action: input.admin_action,
  };
  const interpretation = interpretIncident({ ...payload, context: input.context });
  payload.context = {
    ...input.context,
    plainLanguageTitle: interpretation.title,
    plainLanguageSummary: interpretation.summary,
    plainLanguageUserAction: interpretation.userAction,
    solvysSupportNote: interpretation.supportNote,
  };

  try {
    await fetch('/api/incidents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      keepalive: true,
    });
  } catch {
    // Never let incident reporting become the incident the user sees.
  }
}
