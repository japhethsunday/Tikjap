import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Every route under the authenticated app shell. This list and the matcher
 * below must stay in step with the directories in src/app/(app) — /projects
 * and /bookmarks were shipped without being added here, so their shells
 * rendered for signed-out visitors (the API calls behind them still 401'd,
 * but the pages should never have been reachable).
 */
const PROTECTED_PATHS = ["/home", "/chat", "/code", "/projects", "/bookmarks", "/settings", "/admin"];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });

  const { pathname } = request.nextUrl;
  const isProtected = PROTECTED_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );

  if (isProtected) {
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("next", pathname + request.nextUrl.search);
      return NextResponse.redirect(loginUrl);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/home/:path*",
    "/chat/:path*",
    "/code/:path*",
    "/projects/:path*",
    "/bookmarks/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};