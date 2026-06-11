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
    <aside
      data-floating-install-prompt
      className="pointer-events-none fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+1rem)] z-[55] flex justify-start sm:inset-x-auto sm:left-5 sm:w-[22rem]"
    >
      <div className="pointer-events-auto flex w-full max-w-[22rem] items-center gap-3 rounded-[22px] border border-white/14 bg-[#111111]/90 p-3 text-text shadow-[0_18px_46px_rgba(0,0,0,0.34),inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-2xl">
        <Download className="h-5 w-5 flex-none text-gold" strokeWidth={1.7} />
        <div className="min-w-0 flex-1 text-left">
          <p className="font-caption text-[10px] uppercase tracking-[0.16em] text-text">
            Install StryvFit+
          </p>
          <p className="mt-0.5 font-body text-xs leading-snug text-text-muted">{promptCopy}</p>
        </div>
        <div className="flex flex-none items-center gap-1">
          {installPrompt ? (
            <button
              type="button"
              onClick={handleInstall}
              className="ios-pill inline-flex min-h-9 items-center justify-center rounded-full bg-gold px-3 font-control text-[11px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-gold-deep"
            >
              Install
            </button>
          ) : null}
          <button
            type="button"
            aria-label="Dismiss install prompt"
            onClick={dismiss}
            className="ios-pill rounded-full p-1 text-text-dim transition-colors hover:text-text"
          >
            <X className="h-4 w-4" strokeWidth={1.8} />
          </button>
        </div>
      </div>
    </aside>
  );
}
