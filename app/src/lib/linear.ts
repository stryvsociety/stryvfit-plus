import {
  type IncidentPayload,
  type StoredIncident,
  interpretIncident,
  linearPriorityForSeverity,
} from '@/lib/incidents';

interface LinearIssue {
  id: string;
  identifier: string;
  url: string;
}

interface LinearUploadedFile {
  assetUrl: string;
  contentType: string;
  filename: string;
  size: number;
}

interface LinearGraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

async function linearGraphql<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const apiKey = requiredEnv('SSFITNESS_LINEAR_API_KEY');
  const response = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`Linear API failed with ${response.status}`);
  }

  const data = (await response.json()) as LinearGraphqlResponse<T>;
  if (data.errors?.length) {
    throw new Error(data.errors.map((error) => error.message).join('; '));
  }
  if (!data.data) {
    throw new Error('Linear API returned no data');
  }
  return data.data;
}

function labelIdsForIncident(incident: IncidentPayload): string[] | undefined {
  const configured = process.env.SSFITNESS_LINEAR_INCIDENT_LABEL_IDS;
  if (!configured) return undefined;
  const ids = configured
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  return ids.length ? ids : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function supportIntakeDescription(context: Record<string, unknown> | undefined): string {
  if (!context || !isRecord(context.supportIntake)) return '';

  const intake = context.supportIntake;
  const attachment = isRecord(intake.attachment) ? intake.attachment : null;
  const attachmentLines = attachment
    ? [
        'Uploaded PDF:',
        `- Name: ${String(attachment.name ?? 'Unknown PDF')}`,
        `- Size: ${String(attachment.sizeLabel ?? attachment.size ?? 'Unknown size')}`,
        `- SHA-256: ${String(attachment.sha256 ?? 'Not recorded')}`,
        attachment.linearAssetUrl ? `- Linear file: ${String(attachment.linearAssetUrl)}` : '',
        attachment.linearUploadError ? `- Linear upload error: ${String(attachment.linearUploadError)}` : '',
        attachment.lastModified ? `- Last modified: ${String(attachment.lastModified)}` : '',
      ]
    : ['Uploaded PDF: none'];

  return [
    'Support intake details:',
    `Submitted via: ${String(intake.submittedVia ?? context.requestedFrom ?? 'StryvAdmin')}`,
    `Typed text included: ${intake.hasTypedText ? 'yes' : 'no'}`,
    ...attachmentLines,
    '',
    'Linear routing:',
    '- Team: SSFITNESS_LINEAR_TEAM_ID',
    '- Project: SSFITNESS_LINEAR_PROJECT_ID',
    '- Assignee: SSFITNESS_LINEAR_DEFAULT_ASSIGNEE_ID',
    '- Notification: Linear should notify the assignee when this issue is created.',
  ]
    .filter(Boolean)
    .join('\n');
}

function supportIntakeAttachment(context: Record<string, unknown> | undefined): Record<string, unknown> | null {
  if (!context || !isRecord(context.supportIntake)) return null;
  return isRecord(context.supportIntake.attachment) ? context.supportIntake.attachment : null;
}

async function attachSupportFileToIssue(issueId: string, context: Record<string, unknown> | undefined) {
  const attachment = supportIntakeAttachment(context);
  const url = typeof attachment?.linearAssetUrl === 'string' ? attachment.linearAssetUrl : null;
  if (!attachment || !url) return;

  await linearGraphql<{
    attachmentCreate: { success: boolean };
  }>(
    `
      mutation AttachmentCreate($input: AttachmentCreateInput!) {
        attachmentCreate(input: $input) {
          success
        }
      }
    `,
    {
      input: {
        issueId,
        title: String(attachment.name ?? 'StryvAdmin uploaded PDF'),
        subtitle: 'Uploaded from StryvAdmin support intake',
        url,
        metadata: {
          source: 'StryvAdmin support intake',
          sha256: String(attachment.sha256 ?? ''),
          size: String(attachment.size ?? ''),
          type: String(attachment.type ?? 'application/pdf'),
        },
      },
    }
  );
}

export function linearIssueDescriptionForIncident(incident: StoredIncident | IncidentPayload): string {
  const interpretation = interpretIncident(incident);
  const payload =
    'raw_payload' in incident
      ? incident.raw_payload
      : {
          source: incident.source,
          route: incident.route,
          severity: incident.severity,
          fingerprint: incident.fingerprint,
          context: incident.context,
          admin_action: incident.admin_action,
        };

  return [
    'Auto-filed SSFitness client incident.',
    '',
    'Plain-language interpretation:',
    `Type: ${interpretation.title}`,
    `Where: ${interpretation.routeLabel}`,
    `Client impact: ${interpretation.summary}`,
    `Client-facing action: ${interpretation.userAction}`,
    `Solvys next step: ${interpretation.supportNote}`,
    '',
    'Triage metadata:',
    `Severity: ${incident.severity}`,
    `Source: ${incident.source}`,
    `Route: ${incident.route}`,
    `Fingerprint: ${incident.fingerprint}`,
    'Labels: client-incident, ssf-pwa, severity-' + incident.severity,
    'Assignee source: SSFITNESS_LINEAR_DEFAULT_ASSIGNEE_ID',
    '',
    supportIntakeDescription(incident.context),
    '',
    'Expected behavior:',
    'The StryvFit+ PWA should complete the requested admin/member flow without forcing the client to contact Solvys.',
    '',
    'Actual behavior:',
    incident.message,
    '',
    incident.stack ? ['Stack:', '```', incident.stack, '```'].join('\n') : '',
    'Raw payload:',
    '```json',
    JSON.stringify(payload, null, 2).slice(0, 9000),
    '```',
  ]
    .filter(Boolean)
    .join('\n');
}

export async function createLinearIssueForIncident(
  incident: StoredIncident | IncidentPayload
): Promise<LinearIssue> {
  const teamId = requiredEnv('SSFITNESS_LINEAR_TEAM_ID');
  const assigneeId = requiredEnv('SSFITNESS_LINEAR_DEFAULT_ASSIGNEE_ID');
  const projectId = process.env.SSFITNESS_LINEAR_PROJECT_ID || undefined;
  const labelIds = labelIdsForIncident(incident);
  const interpretation = interpretIncident(incident);
  const title = `[SSFitness ${incident.severity}] ${interpretation.title} - ${interpretation.routeLabel}`.slice(0, 240);

  const data = await linearGraphql<{
    issueCreate: { success: boolean; issue: LinearIssue };
  }>(
    `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            url
          }
        }
      }
    `,
    {
      input: {
        teamId,
        assigneeId,
        projectId,
        labelIds,
        title,
        priority: linearPriorityForSeverity(incident.severity),
        description: linearIssueDescriptionForIncident(incident),
      },
    }
  );

  if (!data.issueCreate.success) {
    throw new Error('Linear issueCreate returned success=false');
  }

  await attachSupportFileToIssue(data.issueCreate.issue.id, incident.context).catch(() => null);

  return data.issueCreate.issue;
}

export async function uploadSupportFileToLinear(file: File): Promise<LinearUploadedFile> {
  const data = await linearGraphql<{
    fileUpload: {
      success: boolean;
      uploadFile?: {
        uploadUrl: string;
        assetUrl: string;
        contentType: string;
        filename: string;
        size: number;
        headers: Array<{ key: string; value: string }>;
      };
    };
  }>(
    `
      mutation FileUpload($contentType: String!, $filename: String!, $size: Int!, $makePublic: Boolean, $metaData: JSON) {
        fileUpload(contentType: $contentType, filename: $filename, size: $size, makePublic: $makePublic, metaData: $metaData) {
          success
          uploadFile {
            uploadUrl
            assetUrl
            contentType
            filename
            size
            headers {
              key
              value
            }
          }
        }
      }
    `,
    {
      contentType: file.type || 'application/pdf',
      filename: file.name,
      size: file.size,
      makePublic: false,
      metaData: { source: 'StryvAdmin support intake' },
    }
  );

  if (!data.fileUpload.success || !data.fileUpload.uploadFile) {
    throw new Error('Linear fileUpload returned success=false');
  }

  const upload = data.fileUpload.uploadFile;
  const headers = new Headers();
  headers.set('Content-Type', upload.contentType || file.type || 'application/pdf');
  headers.set('Cache-Control', 'public, max-age=31536000');
  for (const header of upload.headers) {
    headers.set(header.key, header.value);
  }

  const uploaded = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers,
    body: file,
  });

  if (!uploaded.ok) {
    throw new Error(`Linear file upload failed with ${uploaded.status}`);
  }

  return {
    assetUrl: upload.assetUrl,
    contentType: upload.contentType,
    filename: upload.filename,
    size: upload.size,
  };
}
