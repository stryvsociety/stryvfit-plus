import { NextResponse } from 'next/server';
import { requireApiAdmin } from '@/lib/auth';
import {
  fingerprintIncident,
  normalizeSeverity,
  type IncidentPayload,
  type StoredIncident,
} from '@/lib/incidents';
import { createLinearIssueForIncident, uploadSupportFileToLinear } from '@/lib/linear';
import { serviceClient } from '@/lib/supabase';
import {
  buildSupportIntakeContext,
  buildSupportIntakeMessage,
  supportFileSha256,
  validateSupportPdf,
  type SupportIntakeAttachment,
} from '@/lib/supportIntake';

export const runtime = 'nodejs';

function stringField(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === 'string' ? value.trim() : '';
}

function uploadedFile(formData: FormData): File | null {
  const value = formData.get('file');
  if (!value || typeof value === 'string') return null;
  return value.size > 0 ? value : null;
}

async function fileAttachment(file: File): Promise<SupportIntakeAttachment> {
  const validation = validateSupportPdf(file);
  if (validation) throw new Error(validation);

  const attachment: SupportIntakeAttachment = {
    name: file.name,
    type: file.type || 'application/pdf',
    size: file.size,
    sha256: await supportFileSha256(file),
    lastModified: Number.isFinite(file.lastModified) ? new Date(file.lastModified).toISOString() : undefined,
  };

  try {
    const uploaded = await uploadSupportFileToLinear(file);
    attachment.linearAssetUrl = uploaded.assetUrl;
  } catch (error) {
    attachment.linearUploadError = error instanceof Error ? error.message : 'Linear file upload failed';
  }

  return attachment;
}

export async function POST(req: Request) {
  const admin = await requireApiAdmin();
  if (admin instanceof NextResponse) return admin;

  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return NextResponse.json({ error: 'invalid support intake form' }, { status: 400 });
  }

  const route = stringField(formData, 'route') || '/admin/solvys-support';
  const message = stringField(formData, 'message');
  const clientName = stringField(formData, 'clientName') || admin.full_name || admin.email;
  const severity = normalizeSeverity(stringField(formData, 'severity'));
  const file = uploadedFile(formData);

  if (!message && !file) {
    return NextResponse.json({ error: 'message or PDF is required' }, { status: 400 });
  }

  let attachment: SupportIntakeAttachment | undefined;
  if (file) {
    try {
      attachment = await fileAttachment(file);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'invalid PDF upload' },
        { status: 400 }
      );
    }
  }

  const supportMessage = buildSupportIntakeMessage({ message, attachment });
  const payload: IncidentPayload = {
    source: 'client',
    route,
    message: supportMessage,
    severity,
    fingerprint: fingerprintIncident({
      source: 'client',
      route,
      message: `admin-support:${message}:${attachment?.sha256 ?? 'no-pdf'}:${Date.now()}`,
    }),
    context: buildSupportIntakeContext({
      message,
      severity,
      clientName,
      attachment,
      entryPoint: 'StryvAdmin support intake',
    }),
    admin_action:
      'Create an assigned Linear support ticket, notify the configured default owner through Linear assignment, and attach uploaded PDF/text intake details.',
  };

  const sb = serviceClient();
  const inserted = await sb
    .from('support_incidents')
    .insert({ ...payload, status: 'open', raw_payload: payload })
    .select('*')
    .single();

  if (inserted.error) {
    return NextResponse.json({ error: inserted.error.message }, { status: 500 });
  }

  try {
    const issue = await createLinearIssueForIncident(inserted.data as StoredIncident);
    const updated = await sb
      .from('support_incidents')
      .update({
        status: 'filed',
        linear_issue_id: issue.id,
        linear_issue_identifier: issue.identifier,
        linear_issue_url: issue.url,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inserted.data.id)
      .select('*')
      .single();

    if (updated.error) throw updated.error;
    return NextResponse.json({ incident: updated.data, linear: { ok: true, issue } });
  } catch (error) {
    const updated = await sb
      .from('support_incidents')
      .update({
        status: 'linear_failed',
        raw_payload: {
          ...payload,
          linear_error: error instanceof Error ? error.message : 'Linear filing failed',
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', inserted.data.id)
      .select('*')
      .single();

    return NextResponse.json(
      {
        incident: updated.data ?? inserted.data,
        linear: {
          ok: false,
          error: error instanceof Error ? error.message : 'Linear filing failed',
        },
      },
      { status: 200 }
    );
  }
}
