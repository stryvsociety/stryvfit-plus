'use client';

import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const DISMISS_KEY = 'stryvfit-pwa-login-install-dismissed';

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function InstallAppPrompt() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    setIsInstalled(isStandalone());
    setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true');

    const onInstalled = () => {
      setIsInstalled(true);
      setInstallPrompt(null);
    };
    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === 'true');
    };

    window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);

    return () => {
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    };
  }, []);

  const promptCopy = installPrompt
    ? 'Add the app to your home screen for one-tap booking and coach access.'
    : isIos()
      ? 'On iPhone, use Share, then Add to Home Screen.'
      : null;

  if (isInstalled || dismissed || !promptCopy) return null;

  async function handleInstall() {
    if (!installPrompt) return;

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === 'accepted') {
      setIsInstalled(true);
    }
    setInstallPrompt(null);
  }

  function dismiss() {
    window.localStorage.setItem(DISMISS_KEY, 'true');
    setDismissed(true);
  }

  return (
    <aside className="mt-5 rounded-md border border-gold/20 bg-surface-2/82 p-4 text-text shadow-glass">
      <div className="flex items-start gap-3">
        <Download className="mt-0.5 h-5 w-5 flex-none text-gold" strokeWidth={1.7} />
        <div className="min-w-0 flex-1">
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-text">
            Install StryvFit+
          </p>
          <p className="mt-1 font-body text-xs leading-relaxed text-text-muted">{promptCopy}</p>
          {installPrompt ? (
            <button
              type="button"
              onClick={handleInstall}
              className="ios-pill mt-3 inline-flex min-h-9 items-center justify-center rounded-full bg-gold px-4 font-control text-[11px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-gold-deep"
            >
              Install app
            </button>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Dismiss install prompt"
          onClick={dismiss}
          className="ios-pill rounded-full p-1 text-text-dim transition-colors hover:text-text"
        >
          <X className="h-4 w-4" strokeWidth={1.8} />
        </button>
      </div>
    </aside>
  );
}
