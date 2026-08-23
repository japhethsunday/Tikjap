"use client";

import { Sidebar } from "@/components/sidebar/sidebar";
import { SidebarProvider, useSidebar } from "@/components/sidebar/sidebar-context";
import { CommandPalette } from "@/components/command-palette";
import { useAuth } from "@/components/providers/auth";
import { Spinner } from "@/components/ui/primitives";
import { useRouter } from "next/navigation";

function AppShellInner({ children }: { children: React.ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const { open, setOpen } = useSidebar();

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
      <Sidebar open={open} onClose={() => setOpen(false)} />
      <div className="flex min-w-0 flex-1 flex-col" onClick={() => open && setOpen(false)}>
        {children}
      </div>
      <CommandPalette />
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppShellInner>{children}</AppShellInner>
    </SidebarProvider>
  );
}