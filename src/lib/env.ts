export const APP_MODE: "demo" | "live" =
  process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo";

export const isDemoMode = APP_MODE === "demo";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Tikjap AI";

export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

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