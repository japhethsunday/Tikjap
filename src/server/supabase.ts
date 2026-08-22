import { createServerClient as createSSRServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL, requireSupabaseConfig } from "@/lib/env";

/**
 * SSR client bound to the current request's cookies. Use inside route handlers
 * for anything auth-related (getUser, signIn, signOut, updateUser).
 */
export async function createServerClient() {
  const { url, anonKey } = requireSupabaseConfig();
  const cookieStore = await cookies();
  return createSSRServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — ignore, the user is not signed in.
        }
      },
    },
  });
}

/**
 * Server client for API routes that need to set auth cookies on the response.
 * Pass the NextResponse to allow setting cookies on the response object.
 */
export function createAPIServerClient(response: NextResponse) {
  const { url, anonKey } = requireSupabaseConfig();
  return createSSRServerClient(url, anonKey, {
    cookies: {
      getAll() {
        // For API routes, we can't easily get request cookies without the request object
        // This is a simplified version - in practice you'd pass the request too
        return [];
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });
}

/**
 * Service-role client with full database access. Server-only; never expose
 * SUPABASE_SERVICE_ROLE_KEY to the browser.
 */
export function createServiceClient(): SupabaseClient {
  requireSupabaseConfig();
  return createSupabaseClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}