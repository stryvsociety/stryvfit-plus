'use client';

import { CalendarClock, Dumbbell, LifeBuoy, UsersRound } from 'lucide-react';
import { motion } from 'framer-motion';

type AdminSection = 'appointments' | 'workouts' | 'clients' | 'support';

type AdminSectionNavProps = {
  active: AdminSection;
  onAppointments?: () => void;
  onClients?: () => void;
};

const sections = [
  { id: 'appointments', label: 'Appointments', icon: CalendarClock, href: '/admin/pulse' },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell, href: '/admin/workouts' },
  { id: 'clients', label: 'Clients', icon: UsersRound, href: '/admin/pulse?tab=clients' },
  { id: 'support', label: 'Support', icon: LifeBuoy, href: '/admin/solvys-support' },
] satisfies Array<{
  id: AdminSection;
  label: string;
  icon: typeof CalendarClock;
  href: string;
}>;

export function AdminSectionNav({ active, onAppointments, onClients }: AdminSectionNavProps) {
  return (
    <div className="-mx-1 px-1 pb-1">
      <nav
        aria-label="StryvAdmin sections"
        className="admin-fade-tabs grid min-h-14 grid-cols-2 bg-transparent sm:grid-cols-4"
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = active === section.id;
          const clickHandler =
            section.id === 'appointments'
              ? onAppointments
              : section.id === 'clients'
                ? onClients
                : undefined;
          const content = (
            <>
              <motion.span
                className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap"
                animate={{ opacity: isActive ? 1 : 0.72 }}
                transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
              >
                <Icon className="h-4 w-4 flex-none" />
                <span>{section.label}</span>
              </motion.span>
            </>
          );
          const className = `admin-liquid-button relative inline-flex min-h-12 min-w-0 items-center justify-center bg-transparent px-2 font-caption text-[9px] uppercase tracking-[0.12em] transition-colors sm:px-3 sm:text-[10px] sm:tracking-[0.14em] ${
            isActive ? 'text-[#f24f09]' : 'text-[#6d675f] hover:text-[#f24f09]'
          }`;

          if (clickHandler) {
            return (
              <motion.button
                key={section.id}
                type="button"
                onClick={clickHandler}
                data-active={isActive ? 'true' : 'false'}
                className={className}
              >
                {content}
              </motion.button>
            );
          }

          return (
            <motion.a
              key={section.id}
              href={section.href}
              data-active={isActive ? 'true' : 'false'}
              aria-current={isActive ? 'page' : undefined}
              className={className}
            >
              {content}
            </motion.a>
          );
        })}
      </nav>
    </div>
  );
}
