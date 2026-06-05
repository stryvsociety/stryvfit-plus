'use client';

import { MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { smsHref } from '@/lib/imessage';

export function CoachCTA({ phone, trainerName }: { phone: string | null; trainerName: string }) {
  const name = trainerName.trim() || 'Ashley';
  const href = smsHref(phone, `Hey ${name}, it's`);

  if (!href) {
    return (
      <p className="font-body text-sm text-text-muted">
        Coach hasn&apos;t published a contact number yet. Check back soon.
      </p>
    );
  }

  return (
    <div className="flex flex-col items-start gap-4">
      <p className="font-body text-text-muted text-sm">
        Tap to open iMessage. Your message goes straight to {name} — keep it focused: form question,
        schedule change, or check-in.
      </p>
      <a href={href}>
        <Button variant="gold" size="lg">
          <span className="inline-flex items-center gap-2">
            <MessageCircle size={18} strokeWidth={1.6} /> Message {name}
          </span>
        </Button>
      </a>
    </div>
  );
}
