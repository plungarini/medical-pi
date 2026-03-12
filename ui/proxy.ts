import { NextRequest, NextResponse } from 'next/server';

// Public routes that don't require authentication
const PUBLIC_ROUTES: string[] = ['/login', '/api/chat', '/api/server/health'];

// Public route patterns (prefix matches)
const PUBLIC_PATTERNS: RegExp[] = [
  /^\/api\/server\/.*/, // API server routes
];

// Static file patterns that should be public
const STATIC_PATTERNS: RegExp[] = [
  /^\/_next\/.*/, // Next.js static files
  /^\/favicon\.ico$/, // Favicon
  /^\/(?:.*\.(?:svg|png|jpg|jpeg|gif|ico|css|js|woff|woff2|ttf|otf|eot))$/i, // Static assets
];

/**
 * Checks if a given path matches any public route or static pattern
 * @param pathname - The URL pathname to check
 * @returns boolean indicating if the route is public
 */
function isPublicRoute(pathname: string): boolean {
  // Check exact public routes
  if (PUBLIC_ROUTES.includes(pathname)) {
    return true;
  }

  // Check public route patterns
  if (PUBLIC_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return true;
  }

  // Check static patterns
  if (STATIC_PATTERNS.some((pattern) => pattern.test(pathname))) {
    return true;
  }

  return false;
}

/**
 * Extracts the auth token from the request cookies
 * @param request - The NextRequest object
 * @returns The auth token string or null if not found
 */
function getAuthToken(request: NextRequest): string | null {
  // Check for 'auth-token' cookie
  const token = request.cookies.get('auth-token')?.value;
  return token ?? null;
}

/**
 * Next.js proxy for authentication (replaces deprecated middleware)
 * Redirects unauthenticated users to /login
 * Allows public routes without authentication
 */
export function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  // Allow public routes without authentication
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Check for auth token
  const token = getAuthToken(request);

  // If no token, redirect to login
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    // Store the original URL to redirect back after login
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Token exists, allow the request
  return NextResponse.next();
}

/**
 * Middleware configuration
 * Defines which routes the middleware should run on
 */
export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * 
     * We handle these exclusions in the middleware logic for more control,
     * but we exclude them here for performance.
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
