'use client';

import { useState } from 'react';
import { FileText, MessageSquarePlus, Send, X } from 'lucide-react';
import type { IncidentSeverity } from '@/lib/incidents';
import {
  formatSupportFileSize,
  validateSupportPdf,
} from '@/lib/supportIntake';

type SubmitState =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'filed'; issueUrl?: string; issueIdentifier?: string; attachedPdfName?: string }
  | { kind: 'saved-linear-failed'; reason: string }
  | { kind: 'failed'; reason: string };

type IncidentSubmitResponse = {
  incident?: {
    id: string;
    linear_issue_url?: string | null;
    linear_issue_identifier?: string | null;
  };
  deduped?: boolean;
  linear?: {
    ok?: boolean;
    issue?: {
      identifier?: string;
      url?: string;
    };
    error?: string;
  };
  error?: string;
};

export function AdminSupportChat({ clientName }: { clientName: string }) {
  const [message, setMessage] = useState('');
  const [severity, setSeverity] = useState<IncidentSeverity>('medium');
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [fileInputKey, setFileInputKey] = useState(0);
  const [status, setStatus] = useState<SubmitState>({ kind: 'idle' });

  function resetFile() {
    setFile(null);
    setFileError(null);
    setFileInputKey((key) => key + 1);
  }

  function onFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0] ?? null;
    setStatus({ kind: 'idle' });
    if (!nextFile) {
      resetFile();
      return;
    }

    const validation = validateSupportPdf(nextFile);
    if (validation) {
      setFile(null);
      setFileError(validation);
      event.target.value = '';
      return;
    }

    setFile(nextFile);
    setFileError(null);
  }

  async function submitSupportRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanMessage = message.trim();
    if (!cleanMessage && !file) return;
    const attachedPdfName = file?.name;

    setStatus({ kind: 'sending' });
    const route = `${window.location.pathname}${window.location.search}`;

    if (file) {
      const validation = validateSupportPdf(file);
      if (validation) {
        setFileError(validation);
        setStatus({ kind: 'idle' });
        return;
      }
    }

    const formData = new FormData();
    formData.set('message', cleanMessage);
    formData.set('severity', severity);
    formData.set('clientName', clientName);
    formData.set('route', route);
    if (file) formData.set('file', file);

    try {
      const response = await fetch('/api/incidents/intake', {
        method: 'POST',
        body: formData,
      });
      const result = (await response.json().catch(() => null)) as IncidentSubmitResponse | null;
      if (!response.ok) throw new Error(result?.error ?? 'Support request failed');

      setMessage('');
      resetFile();

      const issueUrl = result?.linear?.issue?.url ?? result?.incident?.linear_issue_url ?? undefined;
      const issueIdentifier = result?.linear?.issue?.identifier ?? result?.incident?.linear_issue_identifier ?? undefined;

      if (result?.linear?.ok === false) {
        setStatus({
          kind: 'saved-linear-failed',
          reason: result.linear.error ?? 'Linear filing failed after the support request was saved.',
        });
        return;
      }

      setStatus({ kind: 'filed', issueUrl, issueIdentifier, attachedPdfName });
    } catch (error) {
      setStatus({
        kind: 'failed',
        reason: error instanceof Error ? error.message : 'Could not send support request.',
      });
    }
  }

  const canSubmit = (Boolean(message.trim()) || Boolean(file)) && !fileError && status.kind !== 'sending';

  return (
    <section className="rounded-md border border-[#dedbd4] bg-white p-4">
      <div className="flex items-center gap-2">
        <MessageSquarePlus className="h-4 w-4 text-[#f24f09]" />
        <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72]">Support request</p>
      </div>
      <form onSubmit={submitSupportRequest} className="mt-3 space-y-3">
        <textarea
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
            if (status.kind !== 'sending') setStatus({ kind: 'idle' });
          }}
          className="min-h-24 w-full resize-none rounded-md border border-[#dedbd4] bg-[#fbfaf8] p-3 font-body text-sm leading-relaxed text-[#151515] outline-none transition focus:border-[#f24f09]"
          placeholder="Tell Solvys what broke, or attach a PDF to the ticket below."
        />
        <label className="block rounded-md border border-dashed border-[#dedbd4] bg-[#fbfaf8] p-3 transition focus-within:border-[#f24f09]">
          <span className="flex items-center gap-2 font-caption text-[9px] uppercase tracking-[0.14em] text-[#817b72]">
            <FileText className="h-4 w-4 text-[#f24f09]" strokeWidth={1.7} />
            Attach PDF to ticket
          </span>
          <input
            key={fileInputKey}
            type="file"
            accept="application/pdf,.pdf"
            onChange={onFileChange}
            className="mt-2 block w-full text-xs file:mr-3 file:rounded-full file:border-0 file:bg-[#151515] file:px-3 file:py-2 file:font-caption file:text-[9px] file:uppercase file:tracking-[0.12em] file:text-white"
          />
          {file ? (
            <span className="mt-3 flex items-center justify-between gap-3 rounded-md border border-[#e6e2da] bg-white px-3 py-2">
              <span className="min-w-0">
                <span className="block truncate font-body text-xs font-semibold text-[#151515]">{file.name}</span>
                <span className="mt-0.5 block font-caption text-[8px] uppercase tracking-[0.12em] text-[#817b72]">
                  {formatSupportFileSize(file.size)}
                </span>
              </span>
              <button
                type="button"
                onClick={resetFile}
                aria-label="Remove uploaded PDF"
                className="inline-flex h-8 w-8 flex-none items-center justify-center rounded-full border border-[#dedbd4] text-[#817b72] transition hover:border-[#f24f09] hover:text-[#f24f09]"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          ) : null}
          {fileError ? <span className="mt-2 block font-body text-xs text-[#b83a14]">{fileError}</span> : null}
        </label>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select
            value={severity}
            onChange={(event) => setSeverity(event.target.value as IncidentSeverity)}
            className="min-h-10 rounded-md border border-[#dedbd4] bg-[#fbfaf8] px-3 font-caption text-[9px] uppercase tracking-[0.12em] text-[#151515] outline-none focus:border-[#f24f09]"
            aria-label="Support severity"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
            <option value="critical">Critical</option>
          </select>
          <button
            type="submit"
            disabled={!canSubmit}
            className="ios-pill inline-flex min-h-10 items-center gap-2 rounded-full bg-[#151515] px-4 font-caption text-[9px] uppercase tracking-[0.13em] text-white transition hover:bg-[#f24f09] disabled:cursor-not-allowed disabled:opacity-45"
          >
            <Send className="h-4 w-4" />
            {status.kind === 'sending' ? 'Submitting' : 'Submit'}
          </button>
        </div>
        {status.kind === 'filed' ? (
          <p className="font-body text-xs leading-relaxed text-[#f24f09]">
            Linear ticket filed and assigned
            {status.issueUrl ? (
              <>
                {' '}
                ·{' '}
                <a href={status.issueUrl} target="_blank" rel="noreferrer" className="font-semibold underline">
                  {status.issueIdentifier ?? 'Open ticket'}
                </a>
              </>
            ) : null}
            .
            {status.attachedPdfName ? (
              <>
                {' '}
                PDF attached: <span className="font-semibold">{status.attachedPdfName}</span>.
              </>
            ) : null}
          </p>
        ) : null}
        {status.kind === 'saved-linear-failed' ? (
          <p className="font-body text-xs leading-relaxed text-[#b83a14]">
            Saved in StryvAdmin, but Linear filing failed: {status.reason}
          </p>
        ) : null}
        {status.kind === 'failed' ? (
          <p className="font-body text-xs leading-relaxed text-[#b83a14]">{status.reason}</p>
        ) : null}
      </form>
    </section>
  );
}
