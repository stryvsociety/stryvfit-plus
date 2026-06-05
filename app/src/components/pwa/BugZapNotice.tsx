'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';

const BUG_ZAP_MESSAGE = "yesterday's bugs have been zapped";

export function BugZapNotice() {
  const [visible, setVisible] = useState(true);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(false), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) return null;

  return (
    <div className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[60] flex justify-start sm:inset-x-auto sm:left-5 sm:w-[22rem]">
      <div
        role="status"
        aria-live="polite"
        onTouchStart={(event) => {
          touchStartX.current = event.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(event) => {
          const start = touchStartX.current;
          touchStartX.current = null;
          const end = event.changedTouches[0]?.clientX;
          if (typeof start === 'number' && typeof end === 'number' && start - end > 44) {
            setVisible(false);
          }
        }}
        className="pointer-events-auto flex w-full max-w-[22rem] items-center gap-3 rounded-[22px] border border-white/14 bg-[#111111]/86 px-4 py-3 font-body text-[0.84rem] font-medium leading-snug text-white shadow-[0_18px_46px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-2xl"
      >
        <p className="min-w-0 flex-1">{BUG_ZAP_MESSAGE}</p>
        <button
          type="button"
          aria-label="Dismiss bug zap notification"
          onClick={() => setVisible(false)}
          className="inline-flex h-7 w-7 flex-none items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/16"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </div>
  );
}
