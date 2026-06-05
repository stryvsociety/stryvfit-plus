import { createFrontendApiProxyHandlers } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import { CLERK_PROXY_PATH, clerkProxyRequestUrl, isClerkProxyRequestHost } from '@/lib/hosts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const handlers = createFrontendApiProxyHandlers({
  proxyPath: CLERK_PROXY_PATH,
});

function redirectToCanonicalProxy(request: Request): Response | null {
  const requestUrl = new URL(request.url);
  if (isClerkProxyRequestHost(requestUrl.host)) return null;

  const target = clerkProxyRequestUrl(requestUrl.pathname, requestUrl.search);
  return NextResponse.redirect(target, 307);
}

function canonicalProxyHandler(handler: (request: Request) => Promise<Response>) {
  return async function handleClerkProxy(request: Request): Promise<Response> {
    return redirectToCanonicalProxy(request) ?? handler(request);
  };
}

export const GET = canonicalProxyHandler(handlers.GET);
export const POST = canonicalProxyHandler(handlers.POST);
export const PUT = canonicalProxyHandler(handlers.PUT);
export const DELETE = canonicalProxyHandler(handlers.DELETE);
export const PATCH = canonicalProxyHandler(handlers.PATCH);
