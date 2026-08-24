"use client";

import { useMemo } from "react";
import { Check, Search, FileText, Globe, Database, Code, Image as ImageIcon, Zap, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dropdown } from "@/components/ui/overlays";
import type { ToolPermission } from "@/lib/tools/types";
import type { ToolAvailability } from "@/lib/types";

const TOOL_CONFIG: Array<{
  id: ToolPermission;
  name: string;
  description: string;
  icon: React.ReactNode;
}> = [
  { id: "web_search", name: "Web Search", description: "Search the web for current information", icon: <Search className="h-4 w-4" aria-hidden /> },
  { id: "file_analysis", name: "File Analysis", description: "Analyze uploaded documents and files", icon: <FileText className="h-4 w-4" aria-hidden /> },
  { id: "url_analysis", name: "URL Analysis", description: "Fetch and analyze content from URLs", icon: <Globe className="h-4 w-4" aria-hidden /> },
  { id: "data_analysis", name: "Data Analysis", description: "Analyze datasets and generate insights", icon: <Database className="h-4 w-4" aria-hidden /> },
  { id: "code_execution", name: "Code Execution", description: "Run code in a secure sandbox", icon: <Code className="h-4 w-4" aria-hidden /> },
  { id: "image_generation", name: "Image Generation", description: "Generate images from text prompts", icon: <ImageIcon className="h-4 w-4" aria-hidden /> },
  { id: "deep_research", name: "Deep Research", description: "Conduct multi-step research investigations", icon: <Zap className="h-4 w-4" aria-hidden /> },
];

interface ToolSelectorProps {
  enabledTools: ToolPermission[];
  onToggle: (toolId: ToolPermission, enabled: boolean) => void;
  disabled?: boolean;
  className?: string;
}

export function ToolSelector({ enabledTools, onToggle, disabled, className }: ToolSelectorProps) {
  const enabledSet = useMemo(() => new Set(enabledTools), [enabledTools]);
  const enabledCount = enabledTools.length;

  return (
    <Dropdown
      className={cn("w-48", className)}
      trigger={({ open, toggle, ref, "aria-expanded": expanded }) => (
        <button
          ref={ref}
          type="button"
          aria-expanded={expanded}
          aria-haspopup="menu"
          onClick={toggle}
          disabled={disabled}
          className={cn(
            "inline-flex w-full items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-sm font-medium text-fg transition-colors hover:bg-surface",
            disabled && "opacity-50 cursor-not-allowed"
          )}
        >
          <span className="truncate flex-1">
            {enabledCount === 0 ? "Select tools" : `${enabledCount} tool${enabledCount !== 1 ? "s" : ""} enabled`}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted transition-transform", open && "rotate-180")} aria-hidden />
        </button>
      )}
    >
      {({ close }) => (
        <>
          <button
            type="button"
            role="menuitem"
            disabled
            className={cn(
              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
              "text-xs font-medium uppercase tracking-wide text-muted"
            )}
          >
            {enabledCount === 0 ? "No tools enabled" : `${enabledCount} tool${enabledCount !== 1 ? "s" : ""} enabled`}
          </button>
          {TOOL_CONFIG.map((tool) => (
            <button
              key={tool.id}
              type="button"
              role="menuitem"
              disabled={disabled}
              onClick={() => {
                if (!disabled) {
                  onToggle(tool.id, !enabledSet.has(tool.id));
                  close();
                }
              }}
              className={cn(
                "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors",
                enabledSet.has(tool.id) ? "text-fg" : "text-muted",
                disabled && "opacity-50 cursor-not-allowed"
              )}
            >
              <span className="flex-shrink-0 text-accent">{tool.icon}</span>
              <div className="min-w-0 flex-1">
                <span className="font-medium truncate block">{tool.name}</span>
                <span className="text-[11px] truncate block">{tool.description}</span>
              </div>
              {enabledSet.has(tool.id) && <Check className="h-4 w-4 text-accent shrink-0" aria-hidden />}
            </button>
          ))}
        </>
      )}
    </Dropdown>
  );
}

interface ToolToggleProps {
  enabledTools: ToolPermission[];
  onToggle: (toolId: ToolPermission, enabled: boolean) => void;
  disabled?: boolean;
  /** Backend availability per tool; missing entries are treated as available. */
  availability?: ToolAvailability[];
  className?: string;
}

export function ToolToggles({ enabledTools, onToggle, disabled, availability, className }: ToolToggleProps) {
  const enabledSet = useMemo(() => new Set(enabledTools), [enabledTools]);
  const unavailable = useMemo(() => {
    const map = new Map<string, string>();
    for (const entry of availability ?? []) {
      if (!entry.available) map.set(entry.id, entry.unavailableReason ?? `${entry.name} is not configured.`);
    }
    return map;
  }, [availability]);

  return (
    // One row, no wrapping: the parent scrolls horizontally instead, so the
    // composer's height does not depend on how many tools exist.
    <div className={cn("flex w-max flex-nowrap items-center gap-1.5", className)}>
      {TOOL_CONFIG.map((tool) => {
        const blockedReason = unavailable.get(tool.id);
        const isDisabled = disabled || Boolean(blockedReason);
        return (
        <button
          key={tool.id}
          type="button"
          onClick={() => !isDisabled && onToggle(tool.id, !enabledSet.has(tool.id))}
          disabled={isDisabled}
          title={blockedReason ?? tool.description}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
            enabledSet.has(tool.id)
              ? "border-primary bg-primary/10 text-primary"
              : "border-line text-muted hover:border-fg hover:bg-surface",
            isDisabled && "opacity-50 cursor-not-allowed"
          )}
          aria-pressed={enabledSet.has(tool.id)}
        >
          <span className="flex-shrink-0">{tool.icon}</span>
          <span>{tool.name}</span>
        </button>
        );
      })}
    </div>
  );
}