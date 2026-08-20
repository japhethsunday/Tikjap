"use client";

import { useState } from "react";
import { Sidebar } from "@/components/sidebar/sidebar";
import { useAuth } from "@/components/providers/auth";
import { Spinner } from "@/components/ui/primitives";
import { useRouter } from "next/navigation";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (status === "loading") {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (status === "unauthenticated") {
    router.replace("/login");
    return null;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-bg text-fg">
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col" onClick={() => sidebarOpen && setSidebarOpen(false)}>
        {children}
      </div>
    </div>
  );
}