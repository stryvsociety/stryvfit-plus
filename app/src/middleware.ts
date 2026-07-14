import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { ADMIN_SIGN_IN_PATH, MEMBER_SIGN_IN_PATH } from '@/lib/routes';
import {
  CLERK_PROXY_PATH,
  adminCanonicalUrlForRequest,
  appCanonicalUrlForRequest,
  clerkProxyRequestUrl,
  clerkProxyUrl,
  isAdminHost,
  isBadAppHost,
  isClerkProxyRequestHost,
} from '@/lib/hosts';

const isMemberProtectedRoute = createRouteMatcher([
  '/book(.*)',
  '/coach(.*)',
  '/notes(.*)',
  '/api/bookings(.*)',
]);

const isAdminProtectedRoute = createRouteMatcher(['/admin(.*)', '/api/admin(.*)']);

const isRetiredMealPrepApiRoute = createRouteMatcher([
  '/api/admin/meal-plans(.*)',
  '/api/client/meal-plans(.*)',
  '/api/ideal-nutrition/meals(.*)',
]);

const isAdminPublicRoute = createRouteMatcher(['/sign-in-admin(.*)', '/admin/access-denied']);

function memberSignInUrl(req: Request & { nextUrl: URL }): URL {
  const signIn = new URL(MEMBER_SIGN_IN_PATH, req.url);
  signIn.searchParams.set('redirect_url', `${req.nextUrl.pathname}${req.nextUrl.search}`);
  return signIn;
}

function adminSignInUrl(req: Request & { nextUrl: URL }): URL {
  return new URL(ADMIN_SIGN_IN_PATH, req.url);
}

export default clerkMiddleware(
  async (auth, req) => {
    const host = req.headers.get('host');

    if (req.nextUrl.pathname.startsWith(CLERK_PROXY_PATH)) {
      if (!isClerkProxyRequestHost(host)) {
        const target = clerkProxyRequestUrl(req.nextUrl.pathname, req.nextUrl.search);
        return NextResponse.redirect(target, 307);
      }
      return;
    }

    if (isAdminHost(host)) {
      const target = adminCanonicalUrlForRequest(req.nextUrl.pathname, req.nextUrl.search);
      return NextResponse.redirect(target, 308);
    }

    if (isBadAppHost(host)) {
      const target = appCanonicalUrlForRequest(req.nextUrl.pathname, req.nextUrl.search);
      return NextResponse.redirect(target, 308);
    }

    if (req.nextUrl.pathname === '/sign-in-admin') {
      return NextResponse.redirect(adminSignInUrl(req), 307);
    }

    if (isRetiredMealPrepApiRoute(req)) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    if (isAdminPublicRoute(req)) {
      return;
    }

    if (isAdminProtectedRoute(req)) {
      const { userId } = await auth();
      if (!userId) {
        if (req.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(adminSignInUrl(req));
      }
      return;
    }

    if (isMemberProtectedRoute(req)) {
      const { userId } = await auth();
      if (!userId) {
        if (req.nextUrl.pathname.startsWith('/api/')) {
          return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
        }
        return NextResponse.redirect(memberSignInUrl(req));
      }
    }
  },
  {
    frontendApiProxy: {
      enabled: (url) => isClerkProxyRequestHost(url.host),
      path: CLERK_PROXY_PATH,
    },
    proxyUrl: clerkProxyUrl(),
  }
);

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/__clerk/(.*)',
    '/(api|trpc)(.*)',
  ],
};
