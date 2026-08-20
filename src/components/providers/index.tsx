"use client";

import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toast";
import { QueryProvider } from "./query";
import { AuthProvider } from "./auth";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>{children}</AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}