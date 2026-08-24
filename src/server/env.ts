import "server-only";

import { SUPABASE_ANON_KEY, SUPABASE_URL } from "@/lib/env";

/**
 * Server-only configuration.
 *
 * The service role key bypasses row level security, so it must never reach a
 * browser bundle. It used to live in `src/lib/env.ts` alongside the public
 * NEXT_PUBLIC_* values; nothing client-side imported it, but a single careless
 * `import { … } from "@/lib/env"` in a client component would have inlined the
 * key into the JavaScript served to every visitor.
 *
 * Keeping it here with the `server-only` guard turns that mistake into a build
 * error instead of a silent credential leak.
 */
export const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export function requireSupabaseConfig(): {
  url: string;
  anonKey: string;
  serviceRoleKey: string;
} {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error(
      "Missing Supabase configuration. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY."
    );
  }
  return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY, serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY };
}
