import type { IncidentSeverity } from '@/lib/incidents';

export const SUPPORT_INTAKE_MAX_PDF_BYTES = 10 * 1024 * 1024;

export type SupportIntakeAttachment = {
  name: string;
  type: string;
  size: number;
  sha256: string;
  lastModified?: string;
  linearAssetUrl?: string;
  linearUploadError?: string;
};

export type SupportIntakePayload = {
  message: string;
  severity: IncidentSeverity;
  clientName: string;
  attachment?: SupportIntakeAttachment;
  entryPoint: string;
};

export function formatSupportFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function validateSupportPdf(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Upload a PDF file.';
  if (file.size > SUPPORT_INTAKE_MAX_PDF_BYTES) {
    return `PDF must be ${formatSupportFileSize(SUPPORT_INTAKE_MAX_PDF_BYTES)} or smaller.`;
  }
  return null;
}

export async function supportFileSha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('');
}

export function buildSupportIntakeMessage(input: Pick<SupportIntakePayload, 'message' | 'attachment'>): string {
  const cleanMessage = input.message.trim();
  const attachmentLines = input.attachment
    ? [
        'Uploaded PDF:',
        `- Name: ${input.attachment.name}`,
        `- Size: ${formatSupportFileSize(input.attachment.size)}`,
        `- SHA-256: ${input.attachment.sha256}`,
        input.attachment.linearAssetUrl ? `- Linear file: ${input.attachment.linearAssetUrl}` : '',
        input.attachment.linearUploadError ? `- Linear file upload error: ${input.attachment.linearUploadError}` : '',
      ]
    : [];

  return [cleanMessage || 'Support intake submitted with uploaded PDF.', ...attachmentLines]
    .filter(Boolean)
    .join('\n\n');
}

export function buildSupportIntakeContext(input: SupportIntakePayload): Record<string, unknown> {
  return {
    clientName: input.clientName,
    requestedFrom: input.entryPoint,
    supportIntake: {
      submittedVia: 'StryvAdmin support intake',
      hasTypedText: Boolean(input.message.trim()),
      hasPdfUpload: Boolean(input.attachment),
      attachment: input.attachment
        ? {
            ...input.attachment,
            sizeLabel: formatSupportFileSize(input.attachment.size),
          }
        : null,
    },
    linearNotification: {
      assignmentEnv: 'SSFITNESS_LINEAR_DEFAULT_ASSIGNEE_ID',
      projectEnv: 'SSFITNESS_LINEAR_PROJECT_ID',
      labelEnv: 'SSFITNESS_LINEAR_INCIDENT_LABEL_IDS',
      expectedNotification: 'Linear notifies the configured default assignee when the ticket is created.',
    },
  };
}
