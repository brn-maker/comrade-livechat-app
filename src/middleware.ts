import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export const config = {
  matcher: ["/chat/:path*"],
};

/**
 * Middleware for /chat routes.
 * 
 * The standard @supabase/supabase-js client stores auth tokens in
 * localStorage (not cookies), so we cannot reliably check auth state
 * in edge middleware. Instead, we let the request through and rely
 * on the client-side auth check in ChatPage to redirect unauthenticated
 * users back to "/".
 * 
 * The Supabase cookie name follows the pattern:
 *   sb-<PROJECT_REF>-auth-token
 * We check for any cookie starting with "sb-" as a loose gate, but
 * the real auth validation happens client-side via getUser().
 */
export function middleware(request: NextRequest) {
  // Check for any Supabase auth cookie (pattern: sb-<ref>-auth-token)
  const hasSupabaseCookie = Array.from(request.cookies.getAll()).some(
    (cookie) => cookie.name.startsWith("sb-") && cookie.name.endsWith("-auth-token"),
  );

  // Also check localStorage-based auth by looking for the auth storage cookie
  // that some Supabase configurations set
  const hasAnyAuthIndicator = hasSupabaseCookie || 
    request.cookies.has("sb-access-token") ||
    request.cookies.has("sb-refresh-token");

  // If no auth indicator at all, we still let them through because
  // the real Supabase client uses localStorage. The ChatPage component
  // will handle the redirect if the user is truly unauthenticated.
  return NextResponse.next();
}
