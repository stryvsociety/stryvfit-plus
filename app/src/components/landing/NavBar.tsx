'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { LogIn } from 'lucide-react';
import { NAV_ITEMS } from '@/hooks/useActiveSection';
import type { SectionId } from '@/hooks/useActiveSection';
import { BrandWordmark } from '@/components/BrandWordmark';
import { Insignia } from '@/components/Insignia';

export default function NavBar({
  activeSection,
  isDark,
}: {
  activeSection: SectionId;
  isDark: boolean;
}) {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 transition-colors duration-300 ios-safe-top"
      style={{ backgroundColor: isDark ? 'rgba(12, 10, 8, 0.8)' : 'rgba(12, 10, 8, 0.6)' }}
    >
      <div className="backdrop-blur-xl border-b border-gold/5">
        <div className="mx-auto flex h-16 max-w-[1380px] items-center justify-between px-5 sm:px-6 md:h-20 xl:px-8">
          {/* Logo */}
          <a
            href="#hero"
            aria-label="Stryv Society Fitness home"
            className="inline-flex items-center text-text"
          >
            <motion.div
              animate={{ opacity: scrolled ? 0 : 1, width: scrolled ? 0 : 'auto' }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden whitespace-nowrap"
            >
              <BrandWordmark className="w-[190px] sm:w-[220px] md:w-[260px] xl:w-[240px] 2xl:w-[260px]" />
            </motion.div>
            <motion.div
              animate={{ opacity: scrolled ? 1 : 0, width: scrolled ? 'auto' : 0 }}
              transition={{ duration: 0.25, ease: 'easeInOut' }}
              className="overflow-hidden whitespace-nowrap"
            >
              <Insignia className="h-12 w-12 md:h-14 md:w-14" />
            </motion.div>
          </a>

          {/* Desktop nav */}
          <nav className="ml-8 hidden flex-1 items-center justify-end gap-6 xl:flex 2xl:ml-12 2xl:gap-10">
            <div className="flex items-center gap-5 2xl:gap-8">
              {NAV_ITEMS.filter((item) => item.label).map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`whitespace-nowrap font-caption text-[10px] uppercase tracking-[0.15em] transition-all duration-300 ${
                    activeSection === item.id
                      ? 'text-gold'
                      : 'text-text-dim hover:text-text-muted'
                  }`}
                >
                  {item.label}
                </a>
              ))}
            </div>
            <div className="flex items-center gap-3 xl:gap-4">
              <a
                href="/book"
                className="whitespace-nowrap px-3 py-2 glass-button text-gold font-accent text-[10px] uppercase tracking-[0.18em] 2xl:px-5"
              >
                Claim Your Free Session
              </a>
              <Link
                href="/sign-in"
                className="inline-flex min-h-10 items-center justify-center gap-2 whitespace-nowrap rounded-sm border border-gold/20 px-4 font-accent text-[10px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-gold/40 hover:text-gold"
              >
                <LogIn className="h-4 w-4" strokeWidth={1.8} />
                Login
              </Link>
            </div>
          </nav>

          {/* Mobile actions */}
          <div className="flex items-center gap-2 xl:hidden">
            <Link
              href="/sign-in"
              aria-label="Log in"
              className="flex h-9 w-9 items-center justify-center rounded-sm border border-gold/15 bg-bg/30 text-text transition-colors hover:border-gold/35 hover:text-gold"
            >
              <LogIn className="h-4 w-4" strokeWidth={1.8} />
            </Link>
            <MobileMenu activeSection={activeSection} />
          </div>
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ activeSection }: { activeSection: SectionId }) {
  const [open, setOpen] = useState(false);
  const items = NAV_ITEMS.filter((item) => item.label);

  return (
    <div>
      <button
        type="button"
        aria-label={open ? 'Close menu' : 'Open menu'}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="w-9 h-9 flex flex-col items-center justify-center gap-1.5 rounded-sm border border-gold/15 bg-bg/30"
      >
        <span className={`w-5 h-[1px] bg-text block rounded-full transition-transform ${open ? 'translate-y-[5px] rotate-45' : ''}`} />
        <span className={`w-5 h-[1px] bg-text block rounded-full transition-opacity ${open ? 'opacity-0' : 'opacity-100'}`} />
        <span className={`w-5 h-[1px] bg-text block rounded-full transition-transform ${open ? '-translate-y-[5px] -rotate-45' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            className="absolute left-4 right-4 top-[calc(100%+8px)] overflow-hidden rounded-md border border-gold/10 bg-bg/95 shadow-glass backdrop-blur-glass"
          >
            <nav className="flex flex-col p-2">
              {items.map((item) => (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  onClick={() => setOpen(false)}
                  className={`px-4 py-3 font-caption text-[11px] uppercase tracking-[0.15em] transition-colors ${
                    activeSection === item.id ? 'text-gold' : 'text-text-muted'
                  }`}
                >
                  {item.label}
                </a>
              ))}
              <a
                href="/book"
                onClick={() => setOpen(false)}
                className="mx-2 mt-2 rounded-sm bg-gold px-4 py-3 text-center font-accent text-[11px] uppercase tracking-[0.18em] text-bg"
              >
                Claim Your Free Session
              </a>
              <Link
                href="/sign-in"
                onClick={() => setOpen(false)}
                className="mx-2 mt-2 inline-flex min-h-11 items-center justify-center gap-2 rounded-sm border border-gold/20 px-4 py-3 text-center font-accent text-[11px] uppercase tracking-[0.18em] text-text-muted transition-colors hover:border-gold/40 hover:text-gold"
              >
                <LogIn className="h-4 w-4" strokeWidth={1.8} />
                Login
              </Link>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
