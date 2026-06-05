'use client';

import { useClerk } from '@clerk/nextjs';
import { usePathname } from 'next/navigation';
import { LogOut } from 'lucide-react';

type SignOutButtonProps = {
  compact?: boolean;
  className?: string;
};

export function SignOutButton({ compact = false, className = '' }: SignOutButtonProps) {
  const { signOut } = useClerk();
  const pathname = usePathname();
  const redirectUrl = pathname?.startsWith('/admin') ? '/sign-in-admin' : '/sign-in';

  return (
    <button
      type="button"
      title="Sign out"
      aria-label="Sign out"
      onClick={() => void signOut({ redirectUrl })}
      className={`inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-gold/20 bg-bg/70 px-3 font-caption text-[10px] uppercase tracking-[0.14em] text-text transition-colors hover:border-gold/50 hover:text-gold focus:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 ${className}`}
    >
      <LogOut className="h-4 w-4" strokeWidth={1.7} />
      <span className={compact ? 'sr-only' : 'hidden sm:inline'}>Sign out</span>
    </button>
  );
}
