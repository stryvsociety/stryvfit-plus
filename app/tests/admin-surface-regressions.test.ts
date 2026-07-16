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

  test('retries transient Clerk asset probe failures before filing incidents', () => {
    const source = readFileSync(join(appRoot, 'src/components/pwa/PWAClient.tsx'), 'utf8');

    expect(source).toContain('CLERK_ASSET_REACHABILITY_ATTEMPTS = 3');
    expect(source).toContain('CLERK_ASSET_REACHABILITY_RETRY_MS = 750');
    expect(source).toContain("probeUrl.searchParams.set('_stryv_clerk_probe'");
    expect(source).toContain('await delay(CLERK_ASSET_REACHABILITY_RETRY_MS)');
  });

  test('keeps the required maintenance notice visible at the bottom-left', () => {
    const source = readFileSync(join(appRoot, 'src/components/pwa/PWAClient.tsx'), 'utf8');

    expect(source).toContain('data-testid="bug-zap-notice"');
    expect(source).toContain("yesterday&apos;s bugs have been zapped");
    expect(source).toContain('fixed bottom-[calc(1rem+env(safe-area-inset-bottom))] left-3');
    expect(source).toContain('rounded-[18px]');
  });

  test('keeps the retired nutrition workspace out of the shipped admin surface', () => {
    const source = readFileSync(join(appRoot, 'src/app/admin/nutrition/page.tsx'), 'utf8');

    expect(source).toContain("redirect('/admin/pulse')");
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

  test('keeps meal-prep UI out of the active admin studio bundle', () => {
    const source = readFileSync(join(appRoot, 'src/components/admin/TrainerOpsStudio.tsx'), 'utf8');
    const sectionNavSource = readFileSync(join(appRoot, 'src/components/admin/AdminSectionNav.tsx'), 'utf8');
    const bookingServicesSource = readFileSync(join(appRoot, 'src/lib/bookingServices.ts'), 'utf8');
    const adminMealApiSource = readFileSync(join(appRoot, 'src/app/api/admin/meal-plans/route.ts'), 'utf8');
    const clientMealApiSource = readFileSync(join(appRoot, 'src/app/api/client/meal-plans/route.ts'), 'utf8');
    const idealNutritionApiSource = readFileSync(join(appRoot, 'src/app/api/ideal-nutrition/meals/route.ts'), 'utf8');
    const middlewareSource = readFileSync(join(appRoot, 'src/middleware.ts'), 'utf8');
    const clientRequestStoreSource = readFileSync(join(appRoot, 'src/lib/clientRequestStore.ts'), 'utf8');

    expect(source).not.toContain("@/components/meals/MealPrepPlanner");
    expect(source).not.toContain('function MealsPanel');
    expect(source).not.toContain('meal-plan-change');
    expect(sectionNavSource).not.toContain("href: '/admin/pulse?tab=meals'");
    expect(sectionNavSource).not.toContain("label: 'Meals'");
    expect(bookingServicesSource).not.toContain("value === 'meal_prep'");
    expect(adminMealApiSource).toContain("{ status: 404 }");
    expect(clientMealApiSource).toContain("{ status: 404 }");
    expect(idealNutritionApiSource).toContain("{ status: 404 }");
    expect(middlewareSource).toContain("'/api/admin/meal-plans(.*)'");
    expect(middlewareSource).toContain("if (isRetiredMealPrepApiRoute(req))");
    expect(middlewareSource).toContain("{ status: 404 }");
    expect(clientRequestStoreSource).toContain("CLIENT_REQUEST_KINDS = ['trainer-note']");
    expect(clientRequestStoreSource).not.toContain('meal-plan-change');
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
    const stripeClientSource = readFileSync(join(appRoot, 'src/lib/stripeClient.ts'), 'utf8');
    const signInSource = readFileSync(join(appRoot, 'src/app/sign-in/[[...sign-in]]/page.tsx'), 'utf8');

    expect(schedulerSource).toContain('All sessions must be cancelled or rescheduled at least 24 hours in advance.');
    expect(billingSource).toContain("payment_method_types: ['card']");
    expect(billingSource).not.toContain('cashapp');
    expect(billingSource).not.toContain('paypal');
    expect(billingSource).toContain('recoverDraftMembershipInvoice');
    expect(billingSource).toContain("amount_due <= 0");
    expect(stripeClientSource).toContain('Stripe.createFetchHttpClient()');
    expect(stripeClientSource).toContain('timeout: 20_000');
    expect(signInSource).toContain("card: 'mx-auto w-full'");
    expect(signInSource).toContain("rootBox: 'mx-auto w-full'");
  });

  test('keeps SSF-42 client account management wired to Clerk, billing, and cancellation APIs', () => {
    const accountSource = readFileSync(join(appRoot, 'src/components/client/ClientAccountPage.tsx'), 'utf8');
    const bookingFlowSource = readFileSync(join(appRoot, 'src/components/booking/FirstSessionBookingFlow.tsx'), 'utf8');
    const tabSource = readFileSync(join(appRoot, 'src/components/layout/TabBar.tsx'), 'utf8');

    expect(existsSync(join(appRoot, 'src/app/account/page.tsx'))).toBe(true);
    expect(existsSync(join(appRoot, 'src/app/api/client/profile/route.ts'))).toBe(true);
    expect(existsSync(join(appRoot, 'src/app/api/client/bookings/[id]/route.ts'))).toBe(true);
    expect(accountSource).toContain('openUserProfile');
    expect(accountSource).toContain("fetch('/api/client/profile'");
    expect(existsSync(join(appRoot, 'src/app/api/billing/membership-invoice/route.ts'))).toBe(true);
    expect(accountSource).toContain("fetch('/api/billing/membership-invoice'");
    expect(accountSource).toContain('Open secure Stripe invoice');
    expect(accountSource).toContain('<Card id="membership-billing">');
    expect(accountSource).toContain('window.location.assign(payload.url);');
    expect(bookingFlowSource).toContain('href="/account?billing=membership#membership-billing"');
    expect(accountSource).toContain("fetch(`/api/client/bookings/${booking.id}`");
    expect(accountSource).toContain('Use Late Cancel');
    expect(tabSource).toContain("{ href: '/account', label: 'Account'");
    expect(tabSource).toContain('grid grid-cols-4');
    expect(tabSource).not.toContain("href: '/meals'");
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

  test('keeps paid checkout returns confirming bookings and billing before the client sees the calendar again', () => {
    const bookPageSource = readFileSync(join(appRoot, 'src/app/book/page.tsx'), 'utf8');
    const checkoutSource = readFileSync(join(appRoot, 'src/app/api/bookings/checkout/route.ts'), 'utf8');
    const bookingsSource = readFileSync(join(appRoot, 'src/lib/bookings.ts'), 'utf8');
    const billingSource = readFileSync(join(appRoot, 'src/lib/billing.ts'), 'utf8');
    const clientSource = readFileSync(join(appRoot, 'src/components/client/ClientPhaseFlow.tsx'), 'utf8');
    const schedulerSource = readFileSync(join(appRoot, 'src/components/scheduling/GoogleScheduler.tsx'), 'utf8');

    expect(bookPageSource).toContain('confirmPaidBookingReturn');
    expect(bookPageSource).toContain("redirect('/book?booking=confirmed&intent=first-session')");
    expect(bookPageSource).toContain("redirect('/book?booking=calendar_pending&intent=first-session')");
    expect(checkoutSource).toContain("success_url: appUrl('/book?booking=success&intent=first-session&session_id={CHECKOUT_SESSION_ID}')");
    expect(checkoutSource).toContain("cancel_url: appUrl('/book?booking=cancelled&intent=first-session')");
    expect(bookingsSource).toContain('confirmBookingFromStripe(session)');
    expect(bookingsSource).toContain('ensureGoogleEvent(booking)');
    expect(bookingsSource).toContain('session.client_reference_id');
    expect(billingSource).toContain('session.metadata?.booking_id ?? session.client_reference_id');
    expect(clientSource).toContain('You are booked. The team is finalizing your calendar invite.');
    expect(clientSource).toContain('Opening secure checkout. Stripe will collect your payment details next.');
    expect(clientSource).toContain('Choose a package before Stripe');
    expect(clientSource).toContain('requiresMembershipTierSelection');
    expect(schedulerSource).toContain('const bookingButtonDisabled = bookingPending || slotsLoading;');
    expect(schedulerSource).toContain('disabled={bookingButtonDisabled}');
    expect(schedulerSource).toContain('Secure checkout opens next');
    expect(schedulerSource).toContain("setBookingError('Choose a membership package before opening Stripe checkout.')");
    expect(schedulerSource).toContain("setBookingError('Enter a mobile number before booking.')");
    expect(checkoutSource).toContain('releaseBookingForTierChange');
    expect(checkoutSource).toContain('checkout.sessions.expire');
    expect(bookingsSource).toContain('findActiveBookingForSlot');
  });

  test('keeps the first-session guided booking flow full-screen and wired to real checkout and notices', () => {
    const bookPageSource = readFileSync(join(appRoot, 'src/app/book/page.tsx'), 'utf8');
    const flowSource = readFileSync(join(appRoot, 'src/components/booking/FirstSessionBookingFlow.tsx'), 'utf8');
    const checkoutSource = readFileSync(join(appRoot, 'src/app/api/bookings/checkout/route.ts'), 'utf8');
    const authSource = readFileSync(join(appRoot, 'src/lib/auth.ts'), 'utf8');
    const noticeSource = readFileSync(join(appRoot, 'src/lib/bookingNotifications.ts'), 'utf8');

    expect(bookPageSource).toContain('<FirstSessionBookingFlow');
    expect(flowSource).toContain("type BookingStep = 'basic' | 'date' | 'time' | 'package' | 'payment'");
    expect(flowSource).toContain("label: 'Basic Info'");
    expect(flowSource).toContain("label: 'Choose Package'");
    expect(flowSource).toContain('communicationPreference');
    expect(flowSource).toContain('Agree & Open Stripe');
    expect(flowSource).toContain('window.location.href = payload.checkoutUrl');
    expect(checkoutSource).toContain('sendBookingCompletionNotice');
    expect(checkoutSource).toContain('createFreeFirstSessionInvoice');
    expect(checkoutSource).toContain('findActiveBookingForExactSlot');
    expect(checkoutSource).toContain('recoverCheckoutUrl');
    expect(checkoutSource).toContain("communicationPreference === 'text'");
    expect(authSource).toContain('abandoned pending Stripe holds');
    expect(noticeSource).toContain('https://api.resend.com/emails');
    expect(noticeSource).toContain('BOOKING_TEXT_WEBHOOK_URL');
    expect(noticeSource).toContain('idempotencyKey');
    expect(noticeSource).toContain('completionNotice');
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
