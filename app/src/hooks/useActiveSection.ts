'use client';

import { useState, useEffect, useCallback } from 'react';

export const SECTIONS = [
  'hero',
  'method',
  'pricing',
  'winning',
  'faqs',
  'footer',
] as const;

export type SectionId = (typeof SECTIONS)[number];

export const NAV_ITEMS: { id: SectionId; label: string; scrollOffset?: number; mobileScrollOffset?: number }[] = [
  { id: 'hero', label: 'Stryv Society' },
  { id: 'method', label: 'The Method', scrollOffset: 300, mobileScrollOffset: 640 },
  { id: 'pricing', label: 'Pricing', scrollOffset: 100, mobileScrollOffset: 20 },
  { id: 'winning', label: 'StryvDash', scrollOffset: 100, mobileScrollOffset: 0 },
  { id: 'faqs', label: 'FAQs' },
  { id: 'footer', label: '' },
];

const SECTION_BG: Record<SectionId, string> = {
  hero: '#070E13',
  method: '#0A0A0A',
  pricing: '#070E13',
  winning: '#0A0A0A',
  faqs: '#0A0A0A',
  footer: '#070E13',
};

export function useActiveSection() {
  const [activeSection, setActiveSection] = useState<SectionId>('hero');
  const [isOverHero, setIsOverHero] = useState(true);

  const onScroll = useCallback(() => {
    const threshold = 0.3 * window.innerHeight;
    let current: SectionId = 'hero';

    for (const id of SECTIONS) {
      const el = document.getElementById(id);
      if (el) {
        const rect = el.getBoundingClientRect();
        if (rect.top <= threshold) {
          current = id;
        }
      }
    }

    setActiveSection(current);

    const heroEl = document.getElementById('hero');
    if (heroEl) {
      setIsOverHero(heroEl.getBoundingClientRect().bottom > 0);
    }
  }, []);

  useEffect(() => {
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [onScroll]);

  const updateThemeColor = useCallback((section: SectionId) => {
    const color = SECTION_BG[section] || '#070E13';
    document.documentElement.style.backgroundColor = color;
    const metas = document.querySelectorAll('meta[name="theme-color"]');
    metas.forEach((m) => m.setAttribute('content', color));
  }, []);

  useEffect(() => {
    updateThemeColor(activeSection);
  }, [activeSection, updateThemeColor]);

  return { activeSection, isOverHero };
}
