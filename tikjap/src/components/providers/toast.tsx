"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastKind = "success" | "error" | "info";

interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  description?: string;
}

interface ToastContextValue {
  toast: (toast: { kind?: ToastKind; title: string; description?: string }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const KIND_ICON: Record<ToastKind, React.ReactNode> = {
  success: <CheckCircle2 className="h-4 w-4 text-success" aria-hidden />,
  error: <AlertCircle className="h-4 w-4 text-danger" aria-hidden />,
  info: <Info className="h-4 w-4 text-accent" aria-hidden />,
};

const KIND_LABEL: Record<ToastKind, string> = {
  success: "Success",
  error: "Error",
  info: "Info",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (input: { kind?: ToastKind; title: string; description?: string }) => {
      counter.current += 1;
      const id = `toast-${counter.current}-${Date.now()}`;
      const item: Toast = { id, kind: input.kind ?? "info", title: input.title, description: input.description };
      setToasts((current) => [...current, item]);
      window.setTimeout(() => dismiss(id), 4500);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        role="status"
        className="pointer-events-none fixed bottom-4 left-1/2 z-[100] flex w-full max-w-sm -translate-x-1/2 flex-col items-center gap-2 px-4 sm:left-auto sm:right-4 sm:translate-x-0 sm:items-end"
      >
        {toasts.map((item) => (
          <div
            key={item.id}
            className={cn(
              "tk-fade-in pointer-events-auto flex w-full items-start gap-3 rounded-xl border border-line bg-elevated px-3.5 py-3 shadow-lg",
              item.kind === "error" && "border-danger/30"
            )}
          >
            <span className="mt-0.5 shrink-0">{KIND_ICON[item.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-fg">{item.title}</p>
              {item.description ? <p className="mt-0.5 text-xs text-muted">{item.description}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => dismiss(item.id)}
              aria-label={`Dismiss ${KIND_LABEL[item.kind]} notification`}
              className="shrink-0 rounded-md p-1 text-muted hover:bg-surface hover:text-fg"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within ToastProvider.");
  return context;
}