'use client';

import { CalendarClock, Dumbbell, LifeBuoy, Salad, UsersRound } from 'lucide-react';
import { motion } from 'framer-motion';

type AdminSection = 'appointments' | 'workouts' | 'meals' | 'clients' | 'support';

type AdminSectionNavProps = {
  active: AdminSection;
  onAppointments?: () => void;
  onMeals?: () => void;
  onClients?: () => void;
};

const sections = [
  { id: 'appointments', label: 'Appointments', icon: CalendarClock, href: '/admin/pulse' },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell, href: '/admin/workouts' },
  { id: 'meals', label: 'Meals', icon: Salad, href: '/admin/pulse?tab=meals' },
  { id: 'clients', label: 'Clients', icon: UsersRound, href: '/admin/pulse?tab=clients' },
  { id: 'support', label: 'Solvys', icon: LifeBuoy, href: '/admin/solvys-support' },
] satisfies Array<{
  id: AdminSection;
  label: string;
  icon: typeof CalendarClock;
  href: string;
}>;

export function AdminSectionNav({ active, onAppointments, onMeals, onClients }: AdminSectionNavProps) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-1">
      <nav
        aria-label="StryvAdmin sections"
        className="grid min-h-14 min-w-[580px] grid-cols-5 gap-1 rounded-md border border-[#dedbd4] bg-white p-1 shadow-sm sm:min-w-[680px] lg:min-w-full"
      >
        {sections.map((section) => {
          const Icon = section.icon;
          const isActive = active === section.id;
          const clickHandler =
            section.id === 'appointments'
              ? onAppointments
              : section.id === 'meals'
                ? onMeals
                : section.id === 'clients'
                  ? onClients
                  : undefined;
          const content = (
            <>
              {isActive ? (
                <motion.span
                  layoutId="admin-section-nav"
                  className="absolute inset-x-3 bottom-1 h-0.5 rounded-full bg-[#f24f09]"
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                />
              ) : null}
              <motion.span
                className="relative z-10 inline-flex items-center gap-2 whitespace-nowrap"
                animate={{ y: isActive ? -1 : 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              >
                <Icon className="h-4 w-4 flex-none" />
                <span>{section.label}</span>
              </motion.span>
            </>
          );
          const className = `relative inline-flex min-h-12 min-w-0 items-center justify-center rounded-md bg-transparent px-3 font-caption text-[10px] uppercase tracking-[0.14em] transition-colors ${
            isActive ? 'text-[#f24f09]' : 'text-[#6d675f] hover:text-[#f24f09]'
          }`;

          if (clickHandler) {
            return (
              <motion.button
                key={section.id}
                type="button"
                onClick={clickHandler}
                whileTap={{ scale: 0.98 }}
                whileHover={{ y: -1 }}
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
              whileTap={{ scale: 0.98 }}
              whileHover={{ y: -1 }}
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
