"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { collapseUnchanged, diffLines, diffStats } from "@/lib/code/diff";

/**
 * Side-by-nothing unified diff. Unified rather than split because the panel is
 * narrow and a split view halves the usable width for code that is already
 * indented.
 */
export function DiffView({
  before,
  after,
  className,
}: {
  before: string;
  after: string;
  className?: string;
}) {
  const { rows, stats } = useMemo(() => {
    const lines = diffLines(before, after);
    return { rows: collapseUnchanged(lines, 3), stats: diffStats(lines) };
  }, [before, after]);

  if (!stats.changed) {
    return (
      <div className={cn("flex h-full items-center justify-center p-6", className)}>
        <p className="text-xs text-muted">No changes since this file was last saved.</p>
      </div>
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      <div className="flex shrink-0 items-center gap-3 border-b border-line px-3 py-1.5 text-[11px]">
        <span className="text-emerald-500">+{stats.added}</span>
        <span className="text-red-500">−{stats.removed}</span>
        <span className="text-muted">unsaved changes</span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse font-mono text-[12px] leading-relaxed">
          <tbody>
            {rows.map((row, index) => {
              if (row.kind === "gap") {
                return (
                  <tr key={`gap-${index}`}>
                    <td colSpan={3} className="bg-canvas px-3 py-1 text-center text-[11px] text-muted/70">
                      ⋯ {row.count} unchanged line{row.count === 1 ? "" : "s"}
                    </td>
                  </tr>
                );
              }
              const isAdd = row.kind === "add";
              const isRemove = row.kind === "remove";
              return (
                <tr
                  key={`${row.kind}-${index}`}
                  className={cn(
                    isAdd && "bg-emerald-500/10",
                    isRemove && "bg-red-500/10"
                  )}
                >
                  <td className="w-10 select-none border-r border-line px-2 text-right align-top text-muted/60">
                    {row.beforeLine ?? ""}
                  </td>
                  <td className="w-10 select-none border-r border-line px-2 text-right align-top text-muted/60">
                    {row.afterLine ?? ""}
                  </td>
                  <td className="whitespace-pre-wrap break-all px-3 align-top">
                    <span
                      className={cn(
                        "select-none",
                        isAdd ? "text-emerald-500" : isRemove ? "text-red-500" : "text-transparent"
                      )}
                    >
                      {isAdd ? "+" : isRemove ? "−" : " "}{" "}
                    </span>
                    <span className={cn(isAdd || isRemove ? "text-fg" : "text-muted")}>{row.text || " "}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
