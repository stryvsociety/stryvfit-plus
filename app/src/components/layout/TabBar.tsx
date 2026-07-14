'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { CalendarDays, NotebookPen, MessageCircle, UserRound } from 'lucide-react';

const tabs = [
  { href: '/book', label: 'Book', icon: CalendarDays },
  { href: '/notes', label: 'Notes', icon: NotebookPen },
  { href: '/coach', label: 'Coach', icon: MessageCircle },
  { href: '/account', label: 'Account', icon: UserRound },
];

export function TabBar() {
  const pathname = usePathname();
  if (pathname?.startsWith('/admin')) return null;

  return (
    <nav className="fixed bottom-0 inset-x-0 z-40 glass border-t border-border/60 pb-[env(safe-area-inset-bottom)]">
      <ul className="grid grid-cols-4">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = pathname?.startsWith(href);
          return (
            <li key={href}>
              <Link
                href={href}
                className={`flex flex-col items-center gap-1 py-3 text-[10px] font-caption uppercase tracking-[0.12em] transition-colors ${
                  active ? 'text-gold' : 'text-text-muted hover:text-text'
                }`}
              >
                <Icon size={20} strokeWidth={1.5} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
