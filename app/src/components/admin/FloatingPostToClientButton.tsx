'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { Check, CircleArrowUp } from 'lucide-react';

export function FloatingPostToClientButton({
  posted,
  visible,
  onClick,
}: {
  posted: boolean;
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <AnimatePresence>
      {visible ? (
        <motion.button
          type="button"
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 12, scale: 0.96 }}
          whileHover={{ y: -2, scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          onClick={onClick}
          className="ios-pill group fixed bottom-5 left-5 z-50 inline-flex min-h-12 items-center gap-2 overflow-hidden rounded-full border border-[#f24f09] bg-[#151515] px-5 font-caption text-[10px] uppercase tracking-[0.14em] text-white shadow-[0_18px_48px_rgba(0,0,0,0.3)] lg:left-[272px]"
        >
          <span className="absolute inset-0 origin-left scale-x-0 bg-[#f24f09] transition-transform duration-300 ease-out group-hover:scale-x-100" />
          <span className="relative z-10 inline-flex items-center gap-2">
            {posted ? <Check className="h-4 w-4" /> : <CircleArrowUp className="h-4 w-4" />}
            {posted ? 'Posted' : 'Post to client'}
          </span>
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
