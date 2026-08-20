"use client";

import { useId, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  icon?: ReactNode;
}

export function Tabs({
  items,
  value,
  onChange,
}: {
  items: TabItem[];
  value: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div
      role="tablist"
      aria-label="Settings sections"
      className="flex w-full flex-col gap-1 sm:flex-row sm:flex-wrap"
    >
      {items.map((item) => {
        const selected = item.value === value;
        return (
          <button
            key={item.value}
            role="tab"
            id={`${id}-${item.value}`}
            aria-selected={selected}
            aria-controls={`${id}-panel`}
            onClick={() => onChange(item.value)}
            className={cn(
              "flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors",
              selected ? "bg-surface text-fg shadow-sm ring-1 ring-line" : "text-muted hover:bg-surface/60 hover:text-fg"
            )}
          >
            {item.icon ? <span className="text-current" aria-hidden>{item.icon}</span> : null}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}