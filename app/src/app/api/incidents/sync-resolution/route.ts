import { NextResponse } from 'next/server';
import { serviceClient } from '@/lib/supabase';

export const runtime = 'nodejs';

function isAuthorized(req: Request): boolean {
  const secret = process.env.INCIDENT_WEBHOOK_SECRET;
  return Boolean(secret && req.headers.get('x-incident-secret') === secret);
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'invalid body' }, { status: 400 });
  }

  const payload = body as Record<string, unknown>;
  const incidentId = typeof payload.incident_id === 'string' ? payload.incident_id : null;
  const linearIssueId =
    typeof payload.linear_issue_id === 'string' ? payload.linear_issue_id : null;
  const title =
    typeof payload.title === 'string' && payload.title.trim()
      ? payload.title.trim()
      : 'StryvFit+ fix published';
  const summary =
    typeof payload.summary === 'string' && payload.summary.trim()
      ? payload.summary.trim()
      : 'A support incident fix has been published.';

  if (!incidentId && !linearIssueId) {
    return NextResponse.json({ error: 'incident_id or linear_issue_id required' }, { status: 400 });
  }

  const sb = serviceClient();
  const incidentQuery = sb.from('support_incidents').select('*').limit(1);
  const incidentResult = incidentId
    ? await incidentQuery.eq('id', incidentId).maybeSingle()
    : await incidentQuery.eq('linear_issue_id', linearIssueId).maybeSingle();

  if (incidentResult.error) {
    return NextResponse.json({ error: incidentResult.error.message }, { status: 500 });
  }

  const incident = incidentResult.data;
  const existingUpdate = linearIssueId
    ? await sb
        .from('app_update_records')
        .select('*')
        .eq('linear_issue_id', linearIssueId)
        .maybeSingle()
    : null;

  if (existingUpdate?.error) {
    return NextResponse.json({ error: existingUpdate.error.message }, { status: 500 });
  }

  if (existingUpdate?.data) {
    if (incident?.id && incident.status !== 'resolved') {
      await sb
        .from('support_incidents')
        .update({
          status: 'resolved',
          resolution_summary: summary,
          resolved_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', incident.id);
    }

    return NextResponse.json({
      update: existingUpdate.data,
      incident_id: incident?.id ?? null,
      deduped: true,
    });
  }

  const updateRecord = await sb
    .from('app_update_records')
    .insert({
      incident_id: incident?.id ?? null,
      title,
      summary,
      linear_issue_id: linearIssueId ?? incident?.linear_issue_id ?? null,
      linear_issue_url:
        typeof payload.linear_issue_url === 'string'
          ? payload.linear_issue_url
          : incident?.linear_issue_url ?? null,
      commit_sha: typeof payload.commit_sha === 'string' ? payload.commit_sha : null,
      status: 'published',
    })
    .select('*')
    .single();

  if (updateRecord.error) {
    return NextResponse.json({ error: updateRecord.error.message }, { status: 500 });
  }

  if (incident?.id) {
    await sb
      .from('support_incidents')
      .update({
        status: 'resolved',
        resolution_summary: summary,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', incident.id);
  }

  return NextResponse.json({ update: updateRecord.data, incident_id: incident?.id ?? null });
}
