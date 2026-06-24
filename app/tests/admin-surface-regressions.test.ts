import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = join(import.meta.dir, '..', '..');
const appRoot = join(repoRoot, 'app');

describe('admin surface regressions', () => {
  test('keeps stale browser-comment copy out of shipped source and operator docs', () => {
    const offenders = scanFiles([join(appRoot, 'src'), join(repoRoot, 'docs'), join(appRoot, 'README.md')], [
      /Nutrition Command/i,
      /CLIENT RAIL/i,
      /Client CRM/i,
    ]);

    expect(offenders).toEqual([]);
  });

  test('keeps the required daily bug-zap notice visible with exact copy', () => {
    const source = readFileSync(join(appRoot, 'src/components/pwa/PWAClient.tsx'), 'utf8');

    expect(source).toContain('data-testid="bug-zap-notice"');
    expect(source).toContain('yesterday&apos;s bugs have been zapped');
    expect(source).toContain('bottom-[calc(1rem+env(safe-area-inset-bottom))]');
    expect(source).toContain('rounded-[18px]');
  });

  test('retries transient Clerk asset probe failures before filing incidents', () => {
    const source = readFileSync(join(appRoot, 'src/components/pwa/PWAClient.tsx'), 'utf8');

    expect(source).toContain('CLERK_ASSET_REACHABILITY_ATTEMPTS = 3');
    expect(source).toContain('CLERK_ASSET_REACHABILITY_RETRY_MS = 750');
    expect(source).toContain("probeUrl.searchParams.set('_stryv_clerk_probe'");
    expect(source).toContain('await delay(CLERK_ASSET_REACHABILITY_RETRY_MS)');
  });

  test('redirects the retired nutrition workspace into the live meals tab', () => {
    const source = readFileSync(join(appRoot, 'src/app/admin/nutrition/page.tsx'), 'utf8');

    expect(source).toContain("redirect('/admin/pulse?tab=meals')");
    expect(source).not.toContain('MealPrepPlanner');
  });

  test('keeps admin controls wired instead of placeholder-only', () => {
    const offenders = scanFiles(
      [
        join(appRoot, 'src/app/admin'),
        join(appRoot, 'src/components/admin'),
        join(appRoot, 'src/components/meals'),
        join(appRoot, 'src/components/scheduling'),
        join(appRoot, 'src/components/settings'),
      ],
      [
        /href=(["'])#\1/,
        /onClick=\{\(\)\s*=>\s*\{\s*\}\}/,
        /\bcoming soon\b/i,
        /\bnot implemented\b/i,
        /\bunwired\b/i,
      ]
    );

    expect(offenders).toEqual([]);
  });

  test('keeps nutrition target CTAs linked to the selected client profile', () => {
    const source = readFileSync(join(appRoot, 'src/components/admin/TrainerOpsStudio.tsx'), 'utf8');

    expect(source).toContain("const clientProfileHref = `/admin/pulse?tab=clients&client=${encodeURIComponent(selectedClient)}`;");
    expect(source).toContain('href={clientProfileHref}');
    expect(source).toContain('event.preventDefault();');
    expect(source).toContain('onOpenClientProfile();');
    expect(source).toContain('aria-label={`Open ${selectedClient} profile to update ${label.toLowerCase()}`}');
  });

  test('keeps the sidebar collapse control inside the desktop sidebar with click and hover expansion', () => {
    const source = readFileSync(join(appRoot, 'src/components/admin/AdminShell.tsx'), 'utf8');

    expect(source).toContain('<SidebarToggleButton collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(true)} />');
    expect(source).toContain('function handleCollapsedSidebarClick');
    expect(source).toContain('window.setTimeout(expandSidebar, 3000)');
    expect(source).toContain('onMouseEnter={scheduleSidebarExpand}');
    expect(source).toContain('data-testid="admin-sidebar-toggle"');
  });

  test('keeps the client billing recovery loop wired to live Stripe and PWA actions', () => {
    const clientSource = readFileSync(join(appRoot, 'src/components/client/ClientPhaseFlow.tsx'), 'utf8');
    const workerSource = readFileSync(join(appRoot, 'public/sw.js'), 'utf8');

    expect(existsSync(join(appRoot, 'src/app/api/billing/summary/route.ts'))).toBe(true);
    expect(existsSync(join(appRoot, 'src/app/api/billing/retry/route.ts'))).toBe(true);
    expect(existsSync(join(appRoot, 'src/app/api/pwa/push-subscription/route.ts'))).toBe(true);
    expect(clientSource).toContain("fetch('/api/billing/summary'");
    expect(clientSource).toContain("fetch('/api/billing/retry'");
    expect(clientSource).toContain('disabled={billingBusy}');
    expect(clientSource).toContain('Enable billing alerts');
    expect(clientSource).toContain('Update Billing');
    expect(clientSource).toContain('Retry');
    expect(clientSource).not.toContain('pastDueDays');
    expect(workerSource).toContain("action: 'update-billing', title: 'Update Billing'");
    expect(workerSource).toContain("action: 'retry-payment', title: 'Retry'");
  });

  test('keeps intake-requested booking and sign-in fixes visible', () => {
    const schedulerSource = readFileSync(join(appRoot, 'src/components/scheduling/GoogleScheduler.tsx'), 'utf8');
    const billingSource = readFileSync(join(appRoot, 'src/lib/billing.ts'), 'utf8');
    const signInSource = readFileSync(join(appRoot, 'src/app/sign-in/[[...sign-in]]/page.tsx'), 'utf8');

    expect(schedulerSource).toContain('All sessions must be cancelled or rescheduled at least 24 hours in advance.');
    expect(billingSource).toContain("label: 'Credit/debit card'");
    expect(signInSource).toContain("card: 'mx-auto w-full'");
    expect(signInSource).toContain("rootBox: 'mx-auto w-full'");
  });

  test('keeps SSF-42 client account management wired to Clerk, billing, and cancellation APIs', () => {
    const accountSource = readFileSync(join(appRoot, 'src/components/client/ClientAccountPage.tsx'), 'utf8');
    const tabSource = readFileSync(join(appRoot, 'src/components/layout/TabBar.tsx'), 'utf8');

    expect(existsSync(join(appRoot, 'src/app/account/page.tsx'))).toBe(true);
    expect(existsSync(join(appRoot, 'src/app/api/client/profile/route.ts'))).toBe(true);
    expect(existsSync(join(appRoot, 'src/app/api/client/bookings/[id]/route.ts'))).toBe(true);
    expect(accountSource).toContain('openUserProfile');
    expect(accountSource).toContain("fetch('/api/client/profile'");
    expect(accountSource).toContain("fetch('/api/billing/portal'");
    expect(accountSource).toContain("fetch(`/api/client/bookings/${booking.id}`");
    expect(accountSource).toContain('Use Late Cancel');
    expect(tabSource).toContain("{ href: '/account', label: 'Account'");
    expect(tabSource).toContain('grid grid-cols-5');
  });

  test('keeps SSF-42 admin scheduling and profile editing on real app APIs', () => {
    const adminSource = readFileSync(join(appRoot, 'src/components/admin/TrainerOpsStudio.tsx'), 'utf8');
    const schedulerSource = readFileSync(join(appRoot, 'src/components/scheduling/GoogleScheduler.tsx'), 'utf8');
    const bookingsSource = readFileSync(join(appRoot, 'src/lib/bookings.ts'), 'utf8');

    expect(existsSync(join(appRoot, 'src/app/api/admin/bookings/route.ts'))).toBe(true);
    expect(existsSync(join(appRoot, 'src/app/api/admin/clients/[id]/route.ts'))).toBe(true);
    expect(adminSource).toContain("fetch('/api/admin/bookings'");
    expect(adminSource).toContain("fetch(`/api/admin/clients/${client.id}`");
    expect(adminSource).toContain('Creates a StryvFit booking row and a Google Calendar event every time.');
    expect(adminSource).toContain('ClientProfileEditor');
    expect(schedulerSource).toContain('Schedule selected client');
    expect(schedulerSource).toContain('future only');
    expect(schedulerSource).toContain('Remove future repeating');
    expect(bookingsSource).toContain('Google Calendar event could not be created. No appointment was saved.');
    expect(bookingsSource).toContain('updateCalendarEvent(row.google_event_id');
    expect(bookingsSource).toContain('if (!result.ok) throw new Error(result.reason);');
  });
});

function scanFiles(paths: string[], patterns: RegExp[]) {
  const offenders: string[] = [];

  for (const filePath of collectTextFiles(paths)) {
    const source = readFileSync(filePath, 'utf8');
    for (const pattern of patterns) {
      if (pattern.test(source)) {
        offenders.push(`${relative(repoRoot, filePath)} :: ${pattern.source}`);
      }
    }
  }

  return offenders.sort();
}

function collectTextFiles(paths: string[]) {
  const files: string[] = [];
  const allowedExtensions = new Set(['.css', '.md', '.mdx', '.ts', '.tsx']);

  for (const targetPath of paths) {
    if (!existsSync(targetPath)) continue;
    const stat = statSync(targetPath);
    if (stat.isFile()) {
      if (allowedExtensions.has(extensionFor(targetPath))) files.push(targetPath);
      continue;
    }

    for (const entry of readdirSync(targetPath)) {
      if (entry === '.next' || entry === 'node_modules') continue;
      files.push(...collectTextFiles([join(targetPath, entry)]));
    }
  }

  return files;
}

function extensionFor(filePath: string) {
  const lastDot = filePath.lastIndexOf('.');
  return lastDot === -1 ? '' : filePath.slice(lastDot);
}
