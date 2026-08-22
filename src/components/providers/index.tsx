"use client";

import { ThemeProvider } from "./theme";
import { ToastProvider } from "./toast";
import { QueryProvider } from "./query";
import { AuthProvider } from "./auth";
import { PwaRegister } from "@/components/pwa-register";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <ThemeProvider>
        <ToastProvider>
          <AuthProvider>
            {children}
            <PwaRegister />
          </AuthProvider>
        </ToastProvider>
      </ThemeProvider>
    </QueryProvider>
  );
}