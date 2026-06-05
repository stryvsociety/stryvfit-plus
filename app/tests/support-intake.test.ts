import { describe, expect, test } from 'bun:test';
import { fingerprintIncident } from '../src/lib/incidents';
import { linearIssueDescriptionForIncident } from '../src/lib/linear';
import {
  buildSupportIntakeContext,
  buildSupportIntakeMessage,
  formatSupportFileSize,
  validateSupportPdf,
  type SupportIntakeAttachment,
} from '../src/lib/supportIntake';

const attachment: SupportIntakeAttachment = {
  name: 'client-screenshot-review.pdf',
  type: 'application/pdf',
  size: 42_240,
  sha256: 'a'.repeat(64),
  lastModified: '2026-06-04T18:26:00.000Z',
  linearAssetUrl: 'https://linear-assets.com/files/client-screenshot-review.pdf',
};

describe('support intake', () => {
  test('accepts only PDF uploads under the configured limit', () => {
    const pdf = new File(['demo'], 'review.pdf', { type: 'application/pdf' });
    const image = new File(['demo'], 'photo.jpg', { type: 'image/jpeg' });

    expect(validateSupportPdf(pdf)).toBeNull();
    expect(validateSupportPdf(image)).toBe('Upload a PDF file.');
  });

  test('builds a Linear-ready intake message with uploaded PDF metadata', () => {
    const message = buildSupportIntakeMessage({
      message: 'Admin calendar needs a delete button.',
      attachment,
    });

    expect(message).toContain('Admin calendar needs a delete button.');
    expect(message).toContain('Uploaded PDF:');
    expect(message).toContain('client-screenshot-review.pdf');
    expect(message).toContain(formatSupportFileSize(attachment.size));
    expect(message).toContain(attachment.sha256);
    expect(message).toContain(attachment.linearAssetUrl);
  });

  test('adds assignment and notification context to Linear descriptions', () => {
    const message = buildSupportIntakeMessage({ message: 'The 7:30 time is missing.', attachment });
    const context = buildSupportIntakeContext({
      message,
      severity: 'high',
      clientName: 'Ashley',
      attachment,
      entryPoint: 'StryvAdmin support intake',
    });
    const description = linearIssueDescriptionForIncident({
      source: 'client',
      route: '/admin/solvys-support',
      message,
      severity: 'high',
      fingerprint: fingerprintIncident({ source: 'client', route: '/admin/solvys-support', message }),
      context,
      admin_action: 'Create an assigned Linear support ticket.',
    });

    expect(description).toContain('Support intake details:');
    expect(description).toContain('Uploaded PDF:');
    expect(description).toContain('client-screenshot-review.pdf');
    expect(description).toContain('https://linear-assets.com/files/client-screenshot-review.pdf');
    expect(description).toContain('Assignee: SSFITNESS_LINEAR_DEFAULT_ASSIGNEE_ID');
    expect(description).toContain('Linear should notify the assignee');
  });
});
