export const APP_MODE: "demo" | "live" =
  process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo";

export const isDemoMode = APP_MODE === "demo";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Tikjap AI";

export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

export const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";

// SUPABASE_SERVICE_ROLE_KEY and requireSupabaseConfig deliberately live in
// src/server/env.ts behind a `server-only` guard — this module is safe for
// client components to import, and must stay that way.
