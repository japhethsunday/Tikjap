"use client";

import { createContext, useCallback, useContext, useState } from "react";

interface SidebarContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const SidebarContext = createContext<SidebarContextValue>({ open: false, setOpen: () => {} });

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return <SidebarContext.Provider value={{ open, setOpen }}>{children}</SidebarContext.Provider>;
}

export function useSidebar() {
  return useContext(SidebarContext);
}

export function useToggleSidebar() {
  const { open, setOpen } = useSidebar();
  const toggle = useCallback(() => setOpen(!open), [open, setOpen]);
  return { open, toggle, close: useCallback(() => setOpen(false), [setOpen]) };
}