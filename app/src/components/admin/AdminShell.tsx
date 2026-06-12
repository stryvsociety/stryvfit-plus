'use client';

import {
  type CSSProperties,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Dumbbell,
  Home,
  LifeBuoy,
  PanelLeftClose,
  PanelLeftOpen,
  Salad,
  UsersRound,
} from 'lucide-react';
import { BrandWordmark } from '@/components/BrandWordmark';
import { Insignia } from '@/components/Insignia';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { ThemeToggle, type ThemeMode } from '@/components/ui/ThemeToggle';

export type AdminSection = 'appointments' | 'workouts' | 'meals' | 'clients' | 'support';

type Breadcrumb = {
  label: string;
  href?: string;
};

type AdminShellProps = {
  active: AdminSection;
  actions?: ReactNode;
  breadcrumbs: Breadcrumb[];
  children: ReactNode;
  headerControl?: ReactNode;
  onAppointments?: () => void;
  onClients?: () => void;
  onMeals?: () => void;
  onThemeChange?: (theme: ThemeMode) => void;
  theme?: ThemeMode;
  title: string;
};

const adminSections = [
  { id: 'appointments', label: 'Appointments', href: '/admin/pulse', icon: CalendarClock },
  { id: 'workouts', label: 'Workouts', href: '/admin/workouts', icon: Dumbbell },
  { id: 'meals', label: 'Meals', href: '/admin/pulse?tab=meals', icon: Salad },
  { id: 'clients', label: 'Clients', href: '/admin/pulse?tab=clients', icon: UsersRound },
  { id: 'support', label: 'Support', href: '/admin/solvys-support', icon: LifeBuoy },
] satisfies Array<{
  id: AdminSection;
  label: string;
  href: string;
  icon: typeof CalendarClock;
}>;

export function AdminShell({
  active,
  actions,
  breadcrumbs,
  children,
  headerControl,
  onAppointments,
  onClients,
  onMeals,
  onThemeChange,
  theme = 'light',
  title,
}: AdminShellProps) {
  const isDark = theme === 'dark';
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const expandHoverTimer = useRef<number | null>(null);
  const shellClassName = isDark
    ? 'admin-theme-dark bg-[#050402] text-[#f0ead6]'
    : 'admin-theme-light bg-[#ebe5da] text-[#151515]';
  const adminLogoStyle = { '--text': isDark ? '#f0ead6' : '#151515' } as CSSProperties;
  const desktopGridClassName = sidebarCollapsed
    ? 'lg:grid-cols-[76px_minmax(0,1fr)]'
    : 'lg:grid-cols-[248px_minmax(0,1fr)]';

  function clearSidebarExpandTimer() {
    if (expandHoverTimer.current) {
      window.clearTimeout(expandHoverTimer.current);
      expandHoverTimer.current = null;
    }
  }

  function expandSidebar() {
    clearSidebarExpandTimer();
    setSidebarCollapsed(false);
  }

  function scheduleSidebarExpand() {
    if (!sidebarCollapsed) return;
    clearSidebarExpandTimer();
    expandHoverTimer.current = window.setTimeout(expandSidebar, 3000);
  }

  function handleCollapsedSidebarClick(event: MouseEvent<HTMLElement>) {
    if (!sidebarCollapsed) return;

    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target?.closest('a,button,input,select,textarea,[role="button"]')) return;
    expandSidebar();
  }

  function handleCollapsedSidebarKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (!sidebarCollapsed || event.target !== event.currentTarget) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      expandSidebar();
    }
  }

  useEffect(() => {
    return () => {
      if (expandHoverTimer.current) {
        window.clearTimeout(expandHoverTimer.current);
        expandHoverTimer.current = null;
      }
    };
  }, []);

  return (
    <main className={`min-h-dvh ${shellClassName}`}>
      <div className={`grid min-h-dvh transition-[grid-template-columns] duration-300 ease-out ${desktopGridClassName}`}>
        <aside
          aria-label={sidebarCollapsed ? 'Collapsed admin sidebar' : 'Admin sidebar'}
          tabIndex={sidebarCollapsed ? 0 : undefined}
          onClick={handleCollapsedSidebarClick}
          onKeyDown={handleCollapsedSidebarKeyDown}
          onMouseEnter={scheduleSidebarExpand}
          onMouseMove={scheduleSidebarExpand}
          onMouseLeave={clearSidebarExpandTimer}
          onPointerEnter={scheduleSidebarExpand}
          onPointerMove={scheduleSidebarExpand}
          onPointerLeave={clearSidebarExpandTimer}
          className={`sticky top-0 hidden h-dvh border-r border-[#dedbd4] bg-[#f1eadf] transition-[padding] duration-300 ease-out lg:flex lg:flex-col ${
            sidebarCollapsed ? 'p-3' : 'p-4'
          } ${sidebarCollapsed ? 'cursor-pointer' : ''}`}
        >
          <div className={`flex min-h-11 items-center ${sidebarCollapsed ? 'justify-center' : 'justify-between gap-2'}`}>
            <Link
              href="/admin/pulse"
              aria-label="StryvAdmin home"
              title="StryvAdmin home"
              style={adminLogoStyle}
              className={`flex items-center border-0 bg-transparent px-0 py-2 shadow-none transition-all duration-300 ${
                sidebarCollapsed ? 'justify-center' : 'justify-start'
              }`}
            >
              {sidebarCollapsed ? (
                <Insignia className="h-7 w-7" />
              ) : (
                <BrandWordmark className="w-[166px]" />
              )}
            </Link>
            {!sidebarCollapsed ? (
              <SidebarToggleButton collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(true)} />
            ) : null}
          </div>
          <p
            className={`mt-4 font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72] transition-opacity duration-200 ${
              sidebarCollapsed ? 'sr-only' : ''
            }`}
          >
            Admin workspace
          </p>
          <AdminNavList
            active={active}
            collapsed={sidebarCollapsed}
            onAppointments={onAppointments}
            onClients={onClients}
            onMeals={onMeals}
          />
          <div className="mt-auto space-y-3 border-t border-[#dedbd4] pt-4">
            {onThemeChange ? (
              <div
                className={`flex items-center gap-3 ${sidebarCollapsed ? 'justify-center' : 'justify-between'}`}
                title={sidebarCollapsed ? 'Theme' : undefined}
              >
                <span
                  className={`font-caption text-[10px] uppercase tracking-[0.16em] text-[#817b72] ${
                    sidebarCollapsed ? 'sr-only' : ''
                  }`}
                >
                  Theme
                </span>
                <ThemeToggle theme={theme} onChange={onThemeChange} className="ml-auto text-[#151515]" />
              </div>
            ) : null}
            <SignOutButton
              compact={sidebarCollapsed}
              className={`admin-liquid-button border-transparent bg-transparent text-[#151515] hover:text-[#f24f09] ${
                sidebarCollapsed ? 'h-11 w-full px-0' : 'w-full'
              }`}
            />
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-[#dedbd4] bg-[#ebe5da]">
            <div className="px-4 py-3 sm:px-6 lg:px-8">
              <div className="flex flex-wrap items-center gap-3 lg:hidden">
                <Link href="/admin/pulse" aria-label="StryvAdmin home" className="bg-transparent px-0 py-2">
                  <BrandWordmark className="w-[154px]" />
                </Link>
                <SignOutButton className="admin-liquid-button ml-auto border-transparent bg-transparent text-[#151515] hover:text-[#f24f09]" />
              </div>

              <div className="mt-3 flex flex-wrap items-start justify-between gap-4 lg:mt-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <AdminHistoryControls />
                    <AdminBreadcrumbs breadcrumbs={breadcrumbs} />
                  </div>
                  <div className="mt-3 flex flex-wrap items-end gap-4">
                    <h1 className="font-section text-4xl leading-none tracking-normal">{title}</h1>
                    {headerControl ? (
                      <div className="w-full max-w-[26rem] sm:w-[22rem] lg:w-[26rem] lg:pb-1">{headerControl}</div>
                    ) : null}
                  </div>
                </div>
                {actions ? <div className="flex flex-wrap items-center justify-end gap-2">{actions}</div> : null}
              </div>

              <div className="mt-4 lg:hidden">
                <AdminNavList
                  active={active}
                  horizontal
                  onAppointments={onAppointments}
                  onClients={onClients}
                  onMeals={onMeals}
                />
              </div>
            </div>
          </header>

          <motion.div
            key={active}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.34, ease: [0.4, 0, 0.2, 1] }}
            className="px-4 py-5 sm:px-6 lg:px-8"
          >
            {children}
          </motion.div>
        </section>
      </div>
    </main>
  );
}

function AdminHistoryControls() {
  const router = useRouter();

  return (
    <div data-testid="admin-history-controls" className="inline-flex items-center gap-2 border-0 bg-transparent p-0 shadow-none">
      <button
        type="button"
        aria-label="Back"
        onClick={() => router.back()}
        className="admin-liquid-button inline-flex h-8 w-8 items-center justify-center border-0 bg-transparent p-0 text-[#6d675f] shadow-none transition hover:text-[#f24f09] active:scale-95"
      >
        <ArrowLeft className="h-4 w-4" strokeWidth={1.8} />
      </button>
      <button
        type="button"
        aria-label="Forward"
        onClick={() => router.forward()}
        className="admin-liquid-button inline-flex h-8 w-8 items-center justify-center border-0 bg-transparent p-0 text-[#6d675f] shadow-none transition hover:text-[#f24f09] active:scale-95"
      >
        <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
      </button>
      <Link
        href="/admin/pulse"
        aria-label="Admin home"
        className="admin-liquid-button inline-flex h-8 w-8 items-center justify-center border-0 bg-transparent p-0 text-[#6d675f] shadow-none transition hover:text-[#f24f09] active:scale-95"
      >
        <Home className="h-4 w-4" strokeWidth={1.8} />
      </Link>
    </div>
  );
}

function SidebarToggleButton({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;

  return (
    <button
      type="button"
      data-testid="admin-sidebar-toggle"
      aria-label={collapsed ? 'Expand admin sidebar' : 'Collapse admin sidebar'}
      title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      onClick={onToggle}
      className="admin-liquid-button hidden h-10 w-10 items-center justify-center rounded-full text-[#6d675f] transition hover:text-[#f24f09] active:scale-95 lg:inline-flex"
    >
      <Icon className="h-4 w-4" strokeWidth={1.8} />
    </button>
  );
}

function AdminBreadcrumbs({ breadcrumbs }: { breadcrumbs: Breadcrumb[] }) {
  return (
    <nav aria-label="Breadcrumb" data-testid="admin-breadcrumbs" className="min-w-0 border-0 bg-transparent shadow-none">
      <ol className="flex min-w-0 flex-wrap items-center gap-2 border-0 bg-transparent p-0 shadow-none">
        {breadcrumbs.map((crumb, index) => {
          const isLast = index === breadcrumbs.length - 1;
          return (
            <li key={`${crumb.label}:${index}`} className="inline-flex min-w-0 items-center gap-2">
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="font-caption text-[9px] uppercase tracking-[0.14em] text-[#6d675f] transition hover:text-[#f24f09]"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className="truncate font-caption text-[9px] uppercase tracking-[0.14em] text-[#151515]">
                  {crumb.label}
                </span>
              )}
              {!isLast ? <span className="text-[#c2bcb2]">/</span> : null}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AdminNavList({
  active,
  collapsed = false,
  horizontal = false,
  onAppointments,
  onClients,
  onMeals,
}: {
  active: AdminSection;
  collapsed?: boolean;
  horizontal?: boolean;
  onAppointments?: () => void;
  onClients?: () => void;
  onMeals?: () => void;
}) {
  const navClassName = horizontal
    ? 'flex gap-2 overflow-x-auto pb-1'
    : collapsed
      ? 'mt-5 grid gap-1'
      : 'admin-fade-stack mt-5 grid';

  return (
    <nav aria-label="Admin navigation" className={navClassName}>
      {adminSections.map((section) => {
        const onClick =
          section.id === 'appointments'
            ? onAppointments
            : section.id === 'meals'
              ? onMeals
              : section.id === 'clients'
                ? onClients
                : undefined;

        return (
          <AdminNavItem
            key={section.id}
            active={active === section.id}
            collapsed={collapsed && !horizontal}
            horizontal={horizontal}
            href={section.href}
            icon={section.icon}
            label={section.label}
            onClick={onClick}
          />
        );
      })}
    </nav>
  );
}

function AdminNavItem({
  active,
  collapsed,
  horizontal,
  href,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  collapsed: boolean;
  horizontal: boolean;
  href: string;
  icon: typeof CalendarClock;
  label: string;
  onClick?: () => void;
}) {
  const className = collapsed
    ? `admin-liquid-button relative inline-flex h-11 w-full min-w-0 items-center justify-center overflow-hidden border-0 bg-transparent px-0 font-caption text-[10px] uppercase tracking-[0.13em] transition ${
        active ? 'text-[#f24f09]' : 'text-[#6d675f] hover:text-[#f24f09]'
      }`
    : `admin-liquid-button relative inline-flex min-h-12 min-w-0 items-center overflow-hidden border-0 bg-transparent font-caption text-[10px] uppercase tracking-[0.13em] shadow-none transition ${
        horizontal ? 'flex-none' : 'w-full'
      } gap-3 px-3 ${
        active
          ? 'text-[#f24f09]'
          : 'text-[#6d675f] hover:text-[#f24f09]'
      }`;
  const content = (
    <>
      <Icon className="relative z-10 h-4 w-4 flex-none" strokeWidth={1.8} />
      <span className={collapsed ? 'sr-only' : 'relative z-10 truncate'}>{label}</span>
    </>
  );

  if (onClick) {
    return (
      <motion.button
        type="button"
        aria-label={label}
        title={collapsed ? label : undefined}
        data-active={active ? 'true' : 'false'}
        onClick={onClick}
        className={className}
      >
        {content}
      </motion.button>
    );
  }

  return (
    <motion.div>
      <Link
        href={href}
        aria-label={label}
        title={collapsed ? label : undefined}
        data-active={active ? 'true' : 'false'}
        className={className}
      >
        {content}
      </Link>
    </motion.div>
  );
}
