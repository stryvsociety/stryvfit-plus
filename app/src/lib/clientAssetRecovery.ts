'use client';

const RECOVERY_FLAG = 'stryvfit:stale-shell-recovery-attempted';
const RECOVERY_COOLDOWN_MS = 5 * 60 * 1000;

export function isRecoverableChunkLoadError(message: string): boolean {
  return (
    /chunkloaderror/i.test(message) ||
    /loading chunk \d+ failed/i.test(message) ||
    /\/_next\/static\/chunks\/[^\s)]+\.js/i.test(message) ||
    /\/_next\/static\/css\/[^\s)]+\.css/i.test(message) ||
    /script .*\/_next\/static\/chunks\/.* load failed/i.test(message) ||
    /resource .*\/_next\/static\/css\/.* load failed/i.test(message) ||
    /script .*\/__clerk\/npm\/.* load failed/i.test(message)
  );
}

function recoveryRecentlyAttempted(): boolean {
  try {
    const lastAttempt = Number(window.sessionStorage.getItem(RECOVERY_FLAG));
    return Number.isFinite(lastAttempt) && Date.now() - lastAttempt < RECOVERY_COOLDOWN_MS;
  } catch {
    return false;
  }
}

async function clearStryvCaches() {
  if (!('caches' in window)) return;

  const keys = await window.caches.keys();
  await Promise.all(keys.filter((key) => key.startsWith('stryvfit-')).map((key) => window.caches.delete(key)));
}

async function unregisterServiceWorkers() {
  if (!('serviceWorker' in navigator)) return;

  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
}

export async function recoverFromStaleAppShell(): Promise<boolean> {
  if (typeof window === 'undefined' || recoveryRecentlyAttempted()) return false;

  try {
    window.sessionStorage.setItem(RECOVERY_FLAG, String(Date.now()));
  } catch {
    // Best-effort guard only; continue with cache cleanup.
  }

  try {
    await Promise.all([clearStryvCaches(), unregisterServiceWorkers()]);
  } catch {
    // Reloading the current route is still the right recovery attempt.
  }

  const nextUrl = new URL(window.location.href);
  nextUrl.searchParams.set('_stryv_refresh', String(Date.now()));
  window.location.replace(nextUrl.toString());
  return true;
}
