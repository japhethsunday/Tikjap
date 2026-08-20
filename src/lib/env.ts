export const APP_MODE: "demo" | "live" =
  process.env.NEXT_PUBLIC_APP_MODE === "live" ? "live" : "demo";

export const isDemoMode = APP_MODE === "demo";

export const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "Tikjap AI";

export const BILLING_ENABLED = process.env.NEXT_PUBLIC_BILLING_ENABLED === "true";

export const IS_PRODUCTION = process.env.NODE_ENV === "production";