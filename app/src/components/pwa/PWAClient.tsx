'use client';

import { useEffect, useMemo, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { reportIncident } from '@/lib/reportIncident';
import { isRecoverableChunkLoadError, recoverFromStaleAppShell } from '@/lib/clientAssetRecovery';

const HAPTIC_SELECTOR = 'button, a[href], [role="button"], summary';
const OPTIONAL_SERVICE_WORKER_ERRORS = [
  /script .*\/sw\.js.* load failed/i,
  /cannot update a null\/nonexistent service worker registration/i,
  /cannot read properties of undefined \(reading 'update'\)/i,
  /^rejected$/i,
  /securityerror/i,
  /only secure origins/i,
];
const CLERK_ASSET_URL_PATTERN = /(https?:\/\/[^\s)]+\/__clerk\/npm\/[^\s)]+)/i;

function eventLoadMessage(event: Event): string | null {
  const target = event.target;

  if (target instanceof HTMLScriptElement && target.src) {
    return `Script ${target.src} load failed`;
  }

  if (target instanceof HTMLLinkElement && target.href) {
    return `Resource ${target.href} load failed`;
  }

  return null;
}

function rejectionDetails(reason: unknown): { message: string; stack?: string; reason: string } | null {
  if (reason instanceof Error) {
    return { message: reason.message || 'Unhandled promise rejection', stack: reason.stack, reason: reason.message };
  }

  if (reason instanceof Event) {
    const message = eventLoadMessage(reason);
    if (!message) return null;
    return { message, reason: reason.type || 'event' };
  }

  const reasonText = typeof reason === 'string' ? reason : String(reason);
  if (!reasonText || reasonText === '[object Event]') return null;

  return { message: reasonText, reason: reasonText };
}

function isServiceWorkerErrorOptional(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : error instanceof Event
        ? eventLoadMessage(error) ?? error.type
        : String(error);

  return OPTIONAL_SERVICE_WORKER_ERRORS.some((pattern) => pattern.test(message));
}

function clerkAssetUrlFromMessage(message: string): URL | null {
  const match = message.match(CLERK_ASSET_URL_PATTERN);
  if (!match?.[1]) return null;

  try {
    return new URL(match[1].replace(/[.)\]]+$/g, ''));
  } catch {
    return null;
  }
}

function isClerkChunkOrAssetError(message: string): boolean {
  if (!clerkAssetUrlFromMessage(message)) return false;
  return /loading chunk \d+ failed/i.test(message) || /script .*\/__clerk\/npm\/.* load failed/i.test(message);
}

async function clerkAssetIsReachable(url: URL): Promise<boolean> {
  try {
    const head = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    if (head.ok) return true;
  } catch {
    // Fall through to GET because some proxied assets do not support HEAD consistently.
  }

  try {
    const get = await fetch(url, { method: 'GET', cache: 'no-store' });
    return get.ok;
  } catch {
    return false;
  }
}

function canRegisterServiceWorker(): boolean {
  return (
    'serviceWorker' in navigator &&
    window.isSecureContext &&
    (window.location.protocol === 'https:' ||
      window.location.hostname === 'localhost' ||
      window.location.hostname === '127.0.0.1' ||
      window.location.hostname === '::1')
  );
}

export function PWAClient() {
  const pathname = usePathname();
  const [updateReady, setUpdateReady] = useState(false);
  const hidePromptsOnAdminSignIn = pathname?.startsWith('/sign-in-admin') ?? false;

  useEffect(() => {
    async function reportClerkAssetErrorIfStillBroken(input: {
      message: string;
      stack?: string;
      context: Record<string, unknown>;
    }) {
      const assetUrl = clerkAssetUrlFromMessage(input.message);
      if (assetUrl && (await clerkAssetIsReachable(assetUrl))) return;

      void reportIncident({
        source: 'client',
        severity: 'medium',
        message: input.message,
        stack: input.stack,
        context: {
          ...input.context,
          clerkAssetUrl: assetUrl?.href,
          clerkAssetReachable: false,
        },
        admin_action: 'Auto-filed from Clerk asset verification after a chunk load failure.',
      });
    }

    const onError = (event: ErrorEvent) => {
      const loadMessage = eventLoadMessage(event);
      if (loadMessage && isServiceWorkerErrorOptional(loadMessage)) return;
      const message = loadMessage || event.message || 'Unhandled browser error';

      if (isRecoverableChunkLoadError(message)) {
        void recoverFromStaleAppShell().then((reloading) => {
          if (reloading) return;

          if (isClerkChunkOrAssetError(message)) {
            void reportClerkAssetErrorIfStillBroken({
              message,
              stack: event.error?.stack,
              context: {
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                eventType: event.type,
                staleShellRecoveryAttempted: true,
              },
            });
            return;
          }

          void reportIncident({
            source: 'client',
            severity: loadMessage ? 'medium' : 'high',
            message,
            stack: event.error?.stack,
            context: {
              filename: event.filename,
              lineno: event.lineno,
              colno: event.colno,
              eventType: event.type,
              staleShellRecoveryAttempted: true,
            },
            admin_action: 'Auto-filed from global error listener after stale shell recovery was already attempted.',
          });
        });
        return;
      }

      if (isClerkChunkOrAssetError(message)) {
        void reportClerkAssetErrorIfStillBroken({
          message,
          stack: event.error?.stack,
          context: { filename: event.filename, lineno: event.lineno, colno: event.colno, eventType: event.type },
        });
        return;
      }

      void reportIncident({
        source: 'client',
        severity: loadMessage ? 'medium' : 'high',
        message,
        stack: event.error?.stack,
        context: { filename: event.filename, lineno: event.lineno, colno: event.colno, eventType: event.type },
        admin_action: 'Auto-filed from global error listener.',
      });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      const details = rejectionDetails(event.reason);
      if (!details) return;
      if (isServiceWorkerErrorOptional(event.reason) || isServiceWorkerErrorOptional(details.message)) return;

      if (isRecoverableChunkLoadError(details.message)) {
        void recoverFromStaleAppShell().then((reloading) => {
          if (reloading) return;

          if (isClerkChunkOrAssetError(details.message)) {
            void reportClerkAssetErrorIfStillBroken({
              message: details.message,
              stack: details.stack,
              context: { reason: details.reason, staleShellRecoveryAttempted: true },
            });
            return;
          }

          void reportIncident({
            source: 'client',
            severity: 'medium',
            message: details.message,
            stack: details.stack,
            context: { reason: details.reason, staleShellRecoveryAttempted: true },
            admin_action: 'Auto-filed from unhandled promise rejection after stale shell recovery was already attempted.',
          });
        });
        return;
      }

      if (isClerkChunkOrAssetError(details.message)) {
        void reportClerkAssetErrorIfStillBroken({
          message: details.message,
          stack: details.stack,
          context: { reason: details.reason },
        });
        return;
      }

      void reportIncident({
        source: 'client',
        severity: 'medium',
        message: details.message,
        stack: details.stack,
        context: { reason: details.reason },
        admin_action: 'Auto-filed from unhandled promise rejection.',
      });
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
    };
  }, []);

  useEffect(() => {
    let lastPulse = 0;

    const onClick = (event: MouseEvent) => {
      if (typeof navigator.vibrate !== 'function') return;

      const target = event.target instanceof Element ? event.target : null;
      const action = target?.closest<HTMLElement>(HAPTIC_SELECTOR);
      if (!action || action.dataset.haptic === 'off') return;
      if (action.hasAttribute('disabled') || action.getAttribute('aria-disabled') === 'true') return;

      const now = Date.now();
      if (now - lastPulse < 80) return;
      lastPulse = now;
      navigator.vibrate(action.dataset.haptic === 'strong' ? [12, 18, 12] : 10);
    };

    document.addEventListener('click', onClick, { capture: true });
    return () => document.removeEventListener('click', onClick, { capture: true });
  }, []);

  useEffect(() => {
    if (!canRegisterServiceWorker()) return;

    let mounted = true;

    async function clearDevelopmentWorker() {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));

        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      } catch {
        void reportIncident({
          source: 'pwa',
          severity: 'low',
          message: 'Local service worker cleanup failed',
          admin_action: 'Auto-filed from PWA setup.',
        });
      }
    }

    async function registerServiceWorker() {
      if (process.env.NODE_ENV !== 'production') {
        await clearDevelopmentWorker();
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        if (!registration) return;

        try {
          await registration.update();
        } catch (error) {
          if (!isServiceWorkerErrorOptional(error)) {
            void reportIncident({
              source: 'pwa',
              severity: 'low',
              message: error instanceof Error ? error.message : 'Service worker update failed',
              stack: error instanceof Error ? error.stack : undefined,
              admin_action: 'Auto-filed from PWA setup.',
            });
          }
        }

        if (registration.waiting && navigator.serviceWorker.controller) {
          setUpdateReady(true);
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;

          worker.addEventListener('statechange', () => {
            if (mounted && worker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateReady(true);
            }
          });
        });
      } catch (error) {
        if (isServiceWorkerErrorOptional(error)) return;

        void reportIncident({
          source: 'pwa',
          severity: 'medium',
          message: error instanceof Error ? error.message : 'Service worker registration failed',
          stack: error instanceof Error ? error.stack : undefined,
          admin_action: 'Auto-filed from PWA setup.',
        });
      }
    }

    void registerServiceWorker();

    const onControllerChange = () => window.location.reload();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    return () => {
      mounted = false;
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  const banner = useMemo(() => {
    if (updateReady) {
      return {
        icon: RefreshCw,
        tone: 'border-gold/30 bg-surface-2 text-text',
        title: 'Update ready',
        body: 'Refresh once to load the newest StryvFit+ app shell.',
        action: 'update' as const,
      };
    }

    return null;
  }, [updateReady]);

  if (!banner || hidePromptsOnAdminSignIn) return null;

  const Icon = banner.icon;

  async function handleAction() {
    if (banner?.action === 'update') {
      const registration = await navigator.serviceWorker.getRegistration();
      registration?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      if (!registration?.waiting) {
        window.location.reload();
      }
    }
  }

  return (
    <aside className="fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-50 mx-auto max-w-md">
      <div className={`flex items-start gap-3 rounded-md border px-4 py-3 shadow-glass ${banner.tone}`}>
        <Icon className="mt-0.5 h-5 w-5 flex-none text-gold" strokeWidth={1.7} />
        <div className="min-w-0 flex-1">
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-text">
            {banner.title}
          </p>
          <p className="mt-1 font-body text-xs leading-relaxed text-text-muted">{banner.body}</p>
          {banner.action ? (
            <button
              type="button"
              onClick={handleAction}
              className="ios-pill mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-gold px-4 font-control text-[11px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-gold-deep"
            >
              Refresh app
            </button>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
