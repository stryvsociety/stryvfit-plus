import Link from 'next/link';

export function PublicLegalFooter() {
  return (
    <footer className="mt-14 border-t border-gold/10 pt-6">
      <nav
        aria-label="Legal pages"
        className="flex flex-wrap items-center gap-x-4 gap-y-2 font-caption text-[10px] uppercase tracking-[0.14em] text-text-dim"
      >
        <Link href="/" className="transition-colors hover:text-gold">
          Home
        </Link>
        <Link href="/privacy" className="transition-colors hover:text-gold">
          Privacy Policy
        </Link>
        <Link href="/terms" className="transition-colors hover:text-gold">
          Terms of Use
        </Link>
      </nav>
      <p className="mt-4 font-body text-xs leading-relaxed text-text-dim">
        Questions about these terms can be sent to{' '}
        <a className="text-gold" href="mailto:ashley@stryvsocietyfit.com">
          ashley@stryvsocietyfit.com
        </a>
        .
      </p>
    </footer>
  );
}
