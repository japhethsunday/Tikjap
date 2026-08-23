"use client";

import { useMemo } from "react";
import { Check, ChevronsUpDown, Eye, FileText, Server, Zap } from "lucide-react";
import { Dropdown } from "@/components/ui/overlays";
import { cn } from "@/lib/utils";
import type { AIModel } from "@/lib/types";

const CAPABILITY_ICONS: Array<{ key: keyof AIModel["capabilities"]; label: string; icon: React.ReactNode }> = [
  { key: "vision", label: "Vision", icon: <Eye className="h-3 w-3" aria-hidden /> },
  { key: "files", label: "Documents", icon: <FileText className="h-3 w-3" aria-hidden /> },
  { key: "toolUse", label: "Tools", icon: <Zap className="h-3 w-3" aria-hidden /> },
];

export function ModelSelect({
  models,
  value,
  onChange,
  loading,
  compact,
}: {
  models: AIModel[];
  value: string;
  onChange: (modelId: string) => void;
  loading?: boolean;
  compact?: boolean;
}) {
  const selected = useMemo(() => models.find((m) => m.id === value) ?? null, [models, value]);

  if (loading) {
    return (
      <button
        type="button"
        disabled
        className="inline-flex h-8 items-center gap-2 rounded-lg border border-line px-3 text-sm text-muted"
      >
        <Server className="h-3.5 w-3.5" aria-hidden />
        Loading models…
      </button>
    );
  }

  return (
    <Dropdown
      trigger={({ ref, "aria-expanded": expanded, toggle }) => (
        <button
          ref={ref}
          type="button"
          aria-expanded={expanded}
          aria-haspopup="listbox"
          onClick={toggle}
          className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface"
        >
          <Server className="h-3.5 w-3.5 text-muted" aria-hidden />
          <span className={compact ? "hidden sm:inline" : ""}>{selected?.name ?? "Select model"}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 text-muted" aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <div role="listbox" aria-label="Select a model" className="w-72">
          <p className="px-3 pb-1.5 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
            Choose a model
          </p>
          <div className="max-h-72 overflow-y-auto">
            {models.map((model) => {
              const isSelected = model.id === value;
              return (
                <button
                  key={model.id}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onChange(model.id);
                    close();
                  }}
                  className={cn(
                    "flex w-full items-start gap-2.5 rounded-lg px-3 py-2.5 text-left transition-colors",
                    isSelected ? "bg-surface" : "hover:bg-surface/60"
                  )}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-fg">{model.name}</span>
                      {model.isDefault ? (
                        <span className="rounded bg-accent/10 px-1 py-0.5 text-[10px] font-medium text-accent">
                          Default
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted">{model.description}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {CAPABILITY_ICONS.filter((cap) => model.capabilities[cap.key]).map((cap) => (
                        <span
                          key={cap.key}
                          className="inline-flex items-center gap-1 rounded bg-surface px-1.5 py-0.5 text-[10px] text-muted"
                        >
                          {cap.icon}
                          {cap.label}
                        </span>
                      ))}
                    </div>
                  </div>
                  {isSelected ? <Check className="mt-1 h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </Dropdown>
  );
}