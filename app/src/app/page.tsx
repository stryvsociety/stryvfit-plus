'use client';

import { useActiveSection } from '@/hooks/useActiveSection';
import NavBar from '@/components/landing/NavBar';
import HeroSection from '@/components/landing/HeroSection';
import MethodSection from '@/components/landing/MethodSection';
import PricingSection from '@/components/landing/PricingSection';
import WinningSection from '@/components/landing/WinningSection';
import FAQSection from '@/components/landing/FAQSection';
import FooterSection from '@/components/landing/FooterSection';

export default function LandingPage() {
  const { activeSection, isOverHero } = useActiveSection();
  const isDarkSections: string[] = [];
  const isDark = isDarkSections.includes(activeSection) || isOverHero;

  return (
    <div className="relative">
      <NavBar activeSection={activeSection} isDark={isDark} />

      <main>
        {/* Hero */}
        <div className="bg-bg">
          <HeroSection animateIn={true} />
        </div>

        {/* Method — 3 cards divided by vertical gold rulers, no backgrounds */}
        <div className="bg-surface">
          <MethodSection />
        </div>

        {/* Pricing */}
        <div className="bg-bg">
          <PricingSection />
        </div>

        {/* StryvDash — 3 features divided by vertical gold rulers, no backgrounds */}
        <div className="bg-surface">
          <WinningSection />
        </div>

        {/* FAQ */}
        <div className="bg-surface">
          <FAQSection />
        </div>

        {/* Footer */}
        <div className="bg-bg">
          <FooterSection />
        </div>
      </main>
    </div>
  );
}
