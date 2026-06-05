/** Vanity hostname -> canonical admin routes on the Clerk primary domain. */
export const ADMIN_HOST = 'admin.stryvsocietyfit.com';
export const BAD_APP_HOST = 'www.app.stryvsocietyfit.com';
export const CLERK_PROXY_PATH = '/__clerk';

export const APP_ORIGIN =
  configuredValue(process.env.NEXT_PUBLIC_APP_URL) ?? 'https://app.stryvsocietyfit.com';

export const PUBLIC_ORIGIN =
  configuredValue(process.env.NEXT_PUBLIC_PUBLIC_URL) ?? 'https://stryvsocietyfit.com';

export const ADMIN_CANONICAL_ORIGIN =
  configuredValue(process.env.NEXT_PUBLIC_ADMIN_CANONICAL_URL) ?? PUBLIC_ORIGIN;

function configuredValue(value: string | undefined): string | null {
  const trimmed = value?.trim().replace(/\/$/, '');
  return trimmed || null;
}

function configuredClerkProxyUrl(): string | null {
  const value = configuredValue(process.env.NEXT_PUBLIC_CLERK_PROXY_URL);
  if (!value) return null;
  return value.startsWith('/') ? `${PUBLIC_ORIGIN}${value}` : value;
}

function hostOnly(host: string | null | undefined): string {
  return (host ?? '').split(':')[0].toLowerCase();
}

export function isAdminHost(host: string | null | undefined): boolean {
  const normalized = hostOnly(host);
  if (normalized === ADMIN_HOST) return true;
  if (process.env.NODE_ENV === 'development' && normalized === 'localhost') {
    return process.env.NEXT_PUBLIC_ADMIN_DEV_HOST === '1';
  }
  return false;
}

export function isBadAppHost(host: string | null | undefined): boolean {
  return hostOnly(host) === BAD_APP_HOST;
}

export function clerkProxyUrl(): string {
  return configuredClerkProxyUrl() ?? `${PUBLIC_ORIGIN}${CLERK_PROXY_PATH}`;
}

export function clerkProxyRequestUrl(pathname: string, search: string): URL {
  const proxy = new URL(clerkProxyUrl());
  const target = new URL(proxy.origin);
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  target.pathname = normalizedPathname.startsWith(CLERK_PROXY_PATH)
    ? normalizedPathname
    : `${CLERK_PROXY_PATH}${normalizedPathname}`;
  target.search = search;
  return target;
}

export function isClerkProxyRequestHost(host: string | null | undefined): boolean {
  try {
    return hostOnly(host) === new URL(clerkProxyUrl()).hostname.toLowerCase();
  } catch {
    return false;
  }
}

function isAdminRoutePath(pathname: string): boolean {
  return (
    pathname === '/admin' ||
    pathname.startsWith('/admin/') ||
    pathname === '/sign-in-admin' ||
    pathname.startsWith('/sign-in-admin/')
  );
}

/** Map admin.* requests onto the canonical admin host backed by the single Clerk domain. */
export function adminCanonicalUrlForRequest(pathname: string, search: string): URL {
  const url = new URL(ADMIN_CANONICAL_ORIGIN);
  if (isAdminRoutePath(pathname)) {
    url.pathname = pathname;
  } else {
    url.pathname = '/admin/pulse';
  }
  url.search = search;
  return url;
}

/** Recover bad PWA installs that captured www.app.* instead of the canonical app host. */
export function appCanonicalUrlForRequest(pathname: string, search: string): URL {
  const url = new URL(APP_ORIGIN);
  url.pathname = pathname.startsWith('/') ? pathname : `/${pathname}`;
  url.search = search;
  return url;
}
