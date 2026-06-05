import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';

import { TabBar } from './TabBar';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { BrandWordmark } from '@/components/BrandWordmark';

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh pb-20">
      <header className="sticky top-0 z-30 glass border-b border-border/60">
        <div className="px-5 h-14 flex items-center justify-between">
          <Link href="/" aria-label="Stryv Society Fitness home" className="inline-flex items-center text-text">
            <BrandWordmark className="w-[210px]" />
          </Link>
          <div className="flex items-center gap-2">
            <SignOutButton />
            <UserButton />
          </div>
        </div>
      </header>
      <main className="px-5 pt-6">{children}</main>
      <TabBar />
    </div>
  );
}
