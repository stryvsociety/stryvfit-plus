// [claude-code 2026-05-14] Added Insignia to left of BrandWordmark in brand column

'use client';

import { BrandWordmark } from '@/components/BrandWordmark';
import { Insignia } from '@/components/Insignia';

export default function FooterSection() {
  return (
    <section
      id="footer"
      className="relative bg-bg px-6 py-10 sm:py-12 md:py-20"
    >
      <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-gold/20 to-transparent" />

      <div className="mx-auto w-full max-w-6xl">
        <div className="grid grid-cols-1 gap-8 md:grid-cols-3 md:gap-12">
          {/* Brand column */}
          <div>
            <div className="flex items-start gap-2">
              <a href="#hero" aria-label="Stryv Society Fitness home" className="text-text shrink-0">
                <Insignia className="h-14 w-14 sm:h-16 sm:w-16" />
              </a>
              <div className="flex flex-col items-center flex-1 min-w-0">
                <a href="#hero" aria-label="Stryv Society Fitness home" className="text-text">
                  <BrandWordmark className="w-[210px] max-w-full sm:w-[240px]" />
                </a>
                <div className="my-2 h-px w-full bg-gradient-to-r from-transparent via-gold/20 to-transparent sm:my-3" />
                <p className="font-body text-text-muted text-xs tracking-[0.15em] uppercase">
                  Fitness
                </p>
              </div>
            </div>
            <p className="mt-3 max-w-xs font-body text-sm leading-relaxed text-text-muted sm:mt-4">
              Train with Intention. Build with Purpose.
            </p>
          </div>

          {/* Links */}
          <div>
            <h4 className="font-caption text-[10px] tracking-[0.2em] uppercase text-gold mb-4">
              Quick Links
            </h4>
            <ul className="space-y-2.5 md:space-y-3">
              {[
                { label: 'Book a Session', href: '/book' },
                { label: 'Pricing', href: '#pricing' },
                { label: 'Contact', href: 'mailto:ashley@stryvsocietyfit.com' },
                { label: 'Privacy Policy', href: '/privacy' },
                { label: 'Terms of Use', href: '/terms' },
              ].map((link) => (
                <li key={link.label}>
                  <a
                    href={link.href}
                    className="font-body text-text-muted text-sm hover:text-gold transition-colors duration-200"
                  >
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-caption text-[10px] tracking-[0.2em] uppercase text-gold mb-4">
              Get In Touch
            </h4>
            <ul className="space-y-2.5 md:space-y-3">
              <li className="font-body text-text-muted text-sm">ashley@stryvsocietyfit.com</li>
              <li className="font-body text-text-muted text-sm">
                <a href="/book" className="hover:text-gold transition-colors duration-200">
                  Book a Free Session
                </a>
              </li>
              <li>
                <a
                  href="/book"
                  className="inline-block glass-button text-gold font-accent text-[10px] tracking-[0.18em] uppercase px-4 py-2"
                >
                  Claim Your Free Session →
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-3 border-t border-gold/10 pt-6 text-center md:mt-16 md:flex-row md:flex-wrap md:gap-4 md:pt-8">
          <p className="font-caption text-[10px] tracking-[0.1em] text-text-dim">
            &copy; {new Date().getFullYear()} Stryv Society Fitness. All rights reserved.
          </p>
          <nav
            aria-label="Legal"
            className="flex items-center justify-center gap-3 font-caption text-[10px] tracking-[0.1em] text-text-dim"
          >
            <a href="/privacy" className="transition-colors hover:text-gold">
              Privacy Policy
            </a>
            <span aria-hidden="true" className="text-gold/35">
              /
            </span>
            <a href="/terms" className="transition-colors hover:text-gold">
              Terms of Use
            </a>
          </nav>
          <p className="font-caption text-[10px] tracking-[0.1em] text-text-dim">
            Train With Intention. Build With Purpose.
          </p>
          <p className="font-caption text-[10px] tracking-[0.1em] text-text-dim">
            Powered by{' '}
            <a
              href="https://solvys.io/"
              target="_blank"
              rel="noopener noreferrer"
              className="solvys-shimmer-link"
            >
              Solvys.io
            </a>
          </p>
        </div>
      </div>
    </section>
  );
}
