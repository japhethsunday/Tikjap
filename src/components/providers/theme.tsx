"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { THEME_ACCENT_STORAGE_KEY, THEME_STORAGE_KEY } from "@/lib/constants";

export type Theme = "light" | "dark" | "system";
export type AccentId = "indigo" | "violet" | "blue" | "cyan" | "emerald" | "amber" | "rose" | "mono";

export interface AccentOption {
  id: AccentId;
  label: string;
  swatch: string;
  swatchDark: string;
}

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: "indigo", label: "Indigo", swatch: "#4f46e5", swatchDark: "#818cf8" },
  { id: "violet", label: "Violet", swatch: "#7c3aed", swatchDark: "#a78bfa" },
  { id: "blue", label: "Blue", swatch: "#2563eb", swatchDark: "#60a5fa" },
  { id: "cyan", label: "Cyan", swatch: "#0891b2", swatchDark: "#22d3ee" },
  { id: "emerald", label: "Emerald", swatch: "#059669", swatchDark: "#34d399" },
  { id: "amber", label: "Amber", swatch: "#d97706", swatchDark: "#fbbf24" },
  { id: "rose", label: "Rose", swatch: "#e11d48", swatchDark: "#fb7185" },
  { id: "mono", label: "Mono", swatch: "#3f3f46", swatchDark: "#d4d4d8" },
];

const ACCENT_IDS: ReadonlySet<string> = new Set<string>(ACCENT_OPTIONS.map((option) => option.id));

interface ThemeContextValue {
  theme: Theme;
  resolved: "light" | "dark";
  setTheme: (theme: Theme) => void;
  accent: AccentId;
  setAccent: (accent: AccentId) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function readStoredAccent(): AccentId {
  if (typeof window === "undefined") return "indigo";
  const stored = window.localStorage.getItem(THEME_ACCENT_STORAGE_KEY);
  return stored && ACCENT_IDS.has(stored) ? (stored as AccentId) : "indigo";
}

function applyTheme(theme: Theme): "light" | "dark" {
  const resolved = theme === "system" ? getSystemTheme() : theme;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  return resolved;
}

function applyAccent(accent: AccentId): void {
  document.documentElement.dataset.accent = accent;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? "system" : readStoredTheme()
  );
  const [accent, setAccentState] = useState<AccentId>(() =>
    typeof window === "undefined" ? "indigo" : readStoredAccent()
  );
  const [resolved, setResolved] = useState<"light" | "dark">(() => {
    if (typeof window === "undefined") return "light";
    applyAccent(readStoredAccent());
    return applyTheme(readStoredTheme());
  });

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const listener = () => {
      if (theme === "system") setResolved(applyTheme("system"));
    };
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    setThemeState(next);
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
    setResolved(applyTheme(next));
  }, []);

  const setAccent = useCallback((next: AccentId) => {
    setAccentState(next);
    window.localStorage.setItem(THEME_ACCENT_STORAGE_KEY, next);
    applyAccent(next);
  }, []);

  const value = useMemo(
    () => ({ theme, resolved, setTheme, accent, setAccent }),
    [theme, resolved, setTheme, accent, setAccent]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) throw new Error("useTheme must be used within ThemeProvider.");
  return context;
}
