import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import { createLinearIssueForIncident } from '@/lib/linear';
import { serviceClient } from '@/lib/supabase';
import {
  linearPriorityForSeverity,
  validateIncidentPayload,
  type StoredIncident,
} from '@/lib/incidents';

export const runtime = 'nodejs';

const OPEN_STATUSES = ['open', 'linear_failed', 'filed', 'in_progress'];

function isAuthorized(req: Request): boolean {
  const secret = process.env.INCIDENT_WEBHOOK_SECRET;
  if (!secret) return true;

  const provided = req.headers.get('x-incident-secret');
  if (provided === secret) return true;

  const origin = req.headers.get('origin');
  const host = req.headers.get('host');
  try {
    return Boolean(origin && host && new URL(origin).host === host);
  } catch {
    return false;
  }
}

function hasIncidentSecret(req: Request): boolean {
  const secret = process.env.INCIDENT_WEBHOOK_SECRET;
  return Boolean(secret && req.headers.get('x-incident-secret') === secret);
}

async function fileLinearAndUpdate(incident: StoredIncident) {
  const sb = serviceClient();

  try {
    const issue = await createLinearIssueForIncident(incident);
    await sb
      .from('support_incidents')
      .update({
        status: 'filed',
        linear_issue_id: issue.id,
        linear_issue_identifier: issue.identifier,
        linear_issue_url: issue.url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident.id);

    return { ok: true, issue };
  } catch (error) {
    await sb
      .from('support_incidents')
      .update({
        status: 'linear_failed',
        raw_payload: {
          ...incident.raw_payload,
          linear_error: error instanceof Error ? error.message : 'Linear filing failed',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident.id);

    return { ok: false, error: error instanceof Error ? error.message : 'Linear filing failed' };
  }
}

export async function GET(req: Request) {
  if (!hasIncidentSecret(req)) {
    const admin = await requireApiAdmin();
    if (admin instanceof NextResponse) return admin;
  }

  try {
    const sb = serviceClient();
    const [incidents, updates] = await Promise.all([
      sb
        .from('support_incidents')
        .select('*')
        .in('status', OPEN_STATUSES)
        .order('last_seen_at', { ascending: false })
        .limit(8),
      sb
        .from('app_update_records')
        .select('*')
        .order('published_at', { ascending: false })
        .limit(5),
    ]);

    if (incidents.error) throw incidents.error;
    if (updates.error) throw updates.error;

    return NextResponse.json({ incidents: incidents.data ?? [], updates: updates.data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        incidents: [],
        updates: [],
        error: error instanceof Error ? error.message : 'Incident health unavailable',
      },
      { status: 200 }
    );
  }
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const payload = validateIncidentPayload(await req.json().catch(() => null));
  if (!payload) {
    return NextResponse.json({ error: 'invalid incident payload' }, { status: 400 });
  }

  if (new URL(req.url).searchParams.get('dry_run') === '1') {
    return NextResponse.json({
      ok: true,
      dry_run: true,
      incident: payload,
      linear: {
        would_file: true,
        priority: linearPriorityForSeverity(payload.severity),
        assignee_env: 'SSFITNESS_LINEAR_DEFAULT_ASSIGNEE_ID',
        team: 'SSFitness',
      },
    });
  }

  try {
    const sb = serviceClient();
    const existing = await sb
      .from('support_incidents')
      .select('*')
      .eq('fingerprint', payload.fingerprint)
      .in('status', OPEN_STATUSES)
      .order('last_seen_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing.error) throw existing.error;

    if (existing.data) {
      const updated = await sb
        .from('support_incidents')
        .update({
          occurrence_count: Number(existing.data.occurrence_count ?? 1) + 1,
          last_seen_at: new Date().toISOString(),
          raw_payload: payload,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.data.id)
        .select('*')
        .single();

      if (updated.error) throw updated.error;
      return NextResponse.json({ incident: updated.data, deduped: true });
    }

    const inserted = await sb
      .from('support_incidents')
      .insert({
        ...payload,
        status: 'open',
        raw_payload: payload,
      })
      .select('*')
      .single();

    if (inserted.error) throw inserted.error;

    const linear = await fileLinearAndUpdate(inserted.data as StoredIncident);
    return NextResponse.json({ incident: inserted.data, deduped: false, linear });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Incident capture failed' },
      { status: 500 }
    );
  }
}
