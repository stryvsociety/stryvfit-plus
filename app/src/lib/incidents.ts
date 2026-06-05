export type IncidentSource =
  | 'client'
  | 'api'
  | 'pwa'
  | 'browserbase'
  | 'google-calendar'
  | 'supabase';

export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'linear_failed' | 'filed' | 'in_progress' | 'resolved';

export interface IncidentPayload {
  source: IncidentSource;
  route: string;
  message: string;
  severity: IncidentSeverity;
  fingerprint: string;
  stack?: string;
  context?: Record<string, unknown>;
  admin_action?: string;
}

export interface StoredIncident extends IncidentPayload {
  id: string;
  status: IncidentStatus;
  occurrence_count: number;
  linear_issue_id: string | null;
  linear_issue_identifier: string | null;
  linear_issue_url: string | null;
  resolution_summary: string | null;
  raw_payload: Record<string, unknown>;
  first_seen_at: string;
  last_seen_at: string;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AppUpdateRecord {
  id: string;
  incident_id: string | null;
  title: string;
  summary: string;
  linear_issue_id: string | null;
  linear_issue_url: string | null;
  commit_sha: string | null;
  status: 'published' | 'applied' | 'dismissed';
  published_at: string;
  applied_at: string | null;
  created_at: string;
}

export type IncidentCategory =
  | 'database'
  | 'sign-in'
  | 'calendar'
  | 'payment'
  | 'app-update'
  | 'connection'
  | 'data-sync'
  | 'app';

export interface IncidentInterpretation {
  category: IncidentCategory;
  title: string;
  summary: string;
  userAction: string;
  supportNote: string;
  routeLabel: string;
  technicalSummary: string;
}

const sources: IncidentSource[] = [
  'client',
  'api',
  'pwa',
  'browserbase',
  'google-calendar',
  'supabase',
];
const severities: IncidentSeverity[] = ['low', 'medium', 'high', 'critical'];

export function normalizeSeverity(value: unknown): IncidentSeverity {
  return severities.includes(value as IncidentSeverity) ? (value as IncidentSeverity) : 'medium';
}

export function normalizeSource(value: unknown): IncidentSource {
  return sources.includes(value as IncidentSource) ? (value as IncidentSource) : 'client';
}

export function fingerprintIncident(input: {
  source: string;
  route?: string | null;
  message: string;
}): string {
  return [input.source, input.route || '/', input.message]
    .join(':')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/[a-f0-9-]{24,}/g, '<id>')
    .replace(/\d{4,}/g, '<num>')
    .replace(/[^a-z0-9:/._-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 180);
}

export function validateIncidentPayload(input: unknown): IncidentPayload | null {
  if (!input || typeof input !== 'object') return null;
  const body = input as Record<string, unknown>;
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return null;

  const source = normalizeSource(body.source);
  const route = typeof body.route === 'string' && body.route.trim() ? body.route.trim() : '/';
  const severity = normalizeSeverity(body.severity);
  const fingerprint =
    typeof body.fingerprint === 'string' && body.fingerprint.trim()
      ? body.fingerprint.trim().slice(0, 180)
      : fingerprintIncident({ source, route, message });
  const stack = typeof body.stack === 'string' ? body.stack.slice(0, 6000) : undefined;
  const context =
    body.context && typeof body.context === 'object' && !Array.isArray(body.context)
      ? (body.context as Record<string, unknown>)
      : undefined;
  const admin_action =
    typeof body.admin_action === 'string' ? body.admin_action.slice(0, 500) : undefined;

  return { source, route, message: message.slice(0, 1000), severity, fingerprint, stack, context, admin_action };
}

export function linearPriorityForSeverity(severity: IncidentSeverity): number {
  if (severity === 'critical') return 1;
  if (severity === 'high') return 2;
  if (severity === 'medium') return 3;
  return 4;
}

function textFromContext(context: Record<string, unknown> | undefined): string {
  if (!context) return '';
  try {
    return JSON.stringify(context);
  } catch {
    return '';
  }
}

function routeLabel(route: string): string {
  const path = route.split('?')[0] || '/';
  if (path.startsWith('/admin/solvys-support')) return 'Solvys support dashboard';
  if (path.startsWith('/admin/pulse')) return 'Admin dashboard';
  if (path.startsWith('/admin/settings')) return 'Admin settings';
  if (path.startsWith('/admin/workouts')) return 'Admin workouts';
  if (path.startsWith('/admin/nutrition')) return 'Admin nutrition';
  if (path.startsWith('/sign-in-admin')) return 'Admin sign-in';
  if (path.startsWith('/sign-in')) return 'Member sign-in';
  if (path.startsWith('/book')) return 'Booking';
  if (path.startsWith('/coach')) return 'Coach contact';
  if (path.startsWith('/notes')) return 'Trainer notes';
  if (path.startsWith('/meals')) return 'Meals';
  if (path === '/') return 'Landing page';
  return path;
}

function categorizeIncident(input: {
  source: IncidentSource;
  route: string;
  message: string;
  stack?: string;
  context?: Record<string, unknown>;
}): IncidentCategory {
  const haystack = [
    input.source,
    input.route,
    input.message,
    input.stack,
    textFromContext(input.context),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    input.source === 'supabase' ||
    /\bsupabase\b|\bpostgrest\b|\bpgrst\d+\b|\bsql\b|\bdatabase\b|\bdb\b|\brelation\b|\bcolumn\b|\brow\b/.test(haystack)
  ) {
    return 'database';
  }
  if (input.source === 'pwa' || /\bservice worker\b|\bsw\.js\b|\bcache\b|\bupdate\b|\bregistration\b/.test(haystack)) {
    return 'app-update';
  }
  if (/\bclerk\b|\boauth\b|\bsign-?in\b|\bsign-?up\b|\bauth\b|\bfrontend-api\.clerk\.dev\b/.test(haystack)) {
    return 'sign-in';
  }
  if (input.source === 'google-calendar' || /\bcalendar\b|\bfreebusy\b|\bgoogle\b/.test(haystack)) {
    return 'calendar';
  }
  if (/\bstripe\b|\bpayment\b|\bcheckout\b|\bwebhook\b|\bprice\b/.test(haystack)) {
    return 'payment';
  }
  if (/\bnetwork\b|\bfetch\b|\bload failed\b|\bfailed to load\b|\bunreachable\b|\btimeout\b/.test(haystack)) {
    return 'connection';
  }
  if (/\bmeal\b|\bideal nutrition\b|\bbrowserbase\b|\bingestion\b|\bsync\b/.test(haystack)) {
    return 'data-sync';
  }
  return 'app';
}

export function interpretIncident(input: {
  source: IncidentSource;
  route: string;
  message: string;
  severity?: IncidentSeverity;
  stack?: string;
  context?: Record<string, unknown>;
  fingerprint?: string;
}): IncidentInterpretation {
  const category = categorizeIncident({
    source: input.source,
    route: input.route,
    message: input.message,
    stack: input.stack,
    context: input.context,
  });
  const where = routeLabel(input.route);
  const severity = input.severity ?? 'medium';

  const copy: Record<IncidentCategory, Omit<IncidentInterpretation, 'category' | 'routeLabel' | 'technicalSummary'>> = {
    database: {
      title: 'Database Error',
      summary: `${where} could not read or save the records it needed.`,
      userAction: 'Refresh once. If it happens again, send it to Solvys so we can check the data connection.',
      supportNote: 'Check Supabase tables, permissions, migrations, and service-role availability for this route.',
    },
    'sign-in': {
      title: 'Sign-in Error',
      summary: `${where} hit an authentication problem while trying to confirm the user.`,
      userAction: 'Try signing in again. If Google or Clerk keeps showing a verification page, send it to Solvys.',
      supportNote: 'Check Clerk proxy routing, OAuth callback domain, session cookies, and admin allowlist state.',
    },
    calendar: {
      title: 'Calendar Error',
      summary: `${where} could not complete the calendar check or calendar event step.`,
      userAction: 'The booking may still be saved. Send it to Solvys so we can confirm the calendar handoff.',
      supportNote: 'Check Google Calendar token refresh, calendar ID, freeBusy responses, and event creation.',
    },
    payment: {
      title: 'Payment Error',
      summary: `${where} could not complete the checkout or payment handoff.`,
      userAction: 'Do not retry repeatedly. Send it to Solvys so we can check the payment record first.',
      supportNote: 'Check Stripe price mapping, checkout session creation, webhook delivery, and booking status.',
    },
    'app-update': {
      title: 'App Update Error',
      summary: `${where} had trouble loading or updating the installed app shell.`,
      userAction: 'Refresh once, then reopen the app. Send it to Solvys if the message comes back.',
      supportNote: 'Check service worker registration, stale caches, asset routes, and app/install scope.',
    },
    connection: {
      title: 'Connection Error',
      summary: `${where} could not reach one of the services it depends on.`,
      userAction: 'Try again once. If it repeats, send it to Solvys so we can trace the failing service.',
      supportNote: 'Check failing fetch destination, Cloudflare worker logs, API route status, and network errors.',
    },
    'data-sync': {
      title: 'Data Sync Error',
      summary: `${where} could not pull in the outside data it expected.`,
      userAction: 'The page can keep working with limited data. Send it to Solvys so we can restore the feed.',
      supportNote: 'Check external source availability, parsing, fallback data, and ingestion incident context.',
    },
    app: {
      title: 'App Error',
      summary: `${where} hit an unexpected app problem.`,
      userAction: 'Refresh once. If the same thing happens again, send it to Solvys.',
      supportNote: 'Check the stack trace, component route, recent deploy, and reproduction path.',
    },
  };

  const technicalSummary = [
    `Severity: ${severity}`,
    `Source: ${input.source}`,
    `Route: ${input.route}`,
    input.fingerprint ? `Fingerprint: ${input.fingerprint}` : '',
    `Message: ${input.message}`,
    input.stack ? `Stack: ${input.stack}` : '',
    input.context ? `Context: ${textFromContext(input.context)}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return {
    category,
    routeLabel: where,
    technicalSummary,
    ...copy[category],
  };
}
