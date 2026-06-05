'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ToastProvider, useToast } from '@/components/ui/Toast';
import { isValidE164 } from '@/lib/imessage';

function FormBody({ initialPhone, initialName }: { initialPhone: string; initialName: string }) {
  const { push } = useToast();
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = phone.trim();
    if (trimmed && !isValidE164(trimmed)) {
      push({ kind: 'error', message: 'Phone must be E.164 (e.g. +13053479816)' });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trainer_phone: trimmed || null, trainer_name: name.trim() }),
      });
      if (!res.ok) throw new Error(await res.text());
      push({ kind: 'success', message: 'Phone number saved' });
    } catch (err) {
      push({ kind: 'error', message: err instanceof Error ? err.message : 'Save failed' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div>
        <label className="font-caption text-[11px] uppercase tracking-[0.16em] text-text-muted block mb-2">
          Trainer name
        </label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ashley" />
      </div>
      <div>
        <label className="font-caption text-[11px] uppercase tracking-[0.16em] text-text-muted block mb-2">
          Trainer phone (E.164)
        </label>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="+13053479816"
        />
        <p className="font-body text-xs text-text-dim mt-2">
          Members see a &quot;Message {name.trim() || 'Ashley'}&quot; button on the Coach tab that opens
          iMessage to this number.
        </p>
      </div>
      <Button type="submit" variant="gold" size="md" disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </Button>
    </form>
  );
}

export function TrainerPhoneForm(props: { initialPhone: string; initialName: string }) {
  return (
    <ToastProvider>
      <FormBody {...props} />
    </ToastProvider>
  );
}
