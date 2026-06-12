'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, CircleArrowUp, LoaderCircle, RotateCcw } from 'lucide-react';

export function FloatingPostToClientButton({
  busy = false,
  disabled = false,
  error = null,
  posted,
  visible,
  onClick,
}: {
  busy?: boolean;
  disabled?: boolean;
  error?: string | null;
  posted: boolean;
  visible: boolean;
  onClick: () => void;
}) {
  const buttonDisabled = busy || disabled;
  const label = busy ? 'Posting' : error ? 'Retry post' : posted ? 'Posted' : 'Post to client';
  const Icon = busy ? LoaderCircle : error ? RotateCcw : posted ? Check : CircleArrowUp;

  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
          onClick={onClick}
          disabled={buttonDisabled}
          title={error ?? undefined}
          className="admin-liquid-button group fixed bottom-5 left-5 z-50 inline-flex min-h-12 items-center gap-2 overflow-hidden px-5 font-caption text-[10px] uppercase tracking-[0.14em] text-[#f24f09] disabled:cursor-not-allowed disabled:opacity-60 lg:left-[272px]"
        >
          <span className="relative z-10 inline-flex items-center gap-2">
            <Icon className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
            {label}
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
