"use client";

import { useState } from "react";
import {
  AlertCircle,
  CheckCircle,
  ChevronDown,
  Code,
  Database,
  FileText,
  Globe,
  Image as ImageIcon,
  Loader2,
  Search,
  Zap,
} from "lucide-react";
import { cn, isValidHttpUrl } from "@/lib/utils";
import type { ToolCallEvent } from "@/lib/types";

const TOOL_ICONS: Record<string, React.ReactNode> = {
  web_search: <Search className="h-3.5 w-3.5" aria-hidden />,
  file_analysis: <FileText className="h-3.5 w-3.5" aria-hidden />,
  url_analysis: <Globe className="h-3.5 w-3.5" aria-hidden />,
  data_analysis: <Database className="h-3.5 w-3.5" aria-hidden />,
  code_execution: <Code className="h-3.5 w-3.5" aria-hidden />,
  image_generation: <ImageIcon className="h-3.5 w-3.5" aria-hidden />,
  deep_research: <Zap className="h-3.5 w-3.5" aria-hidden />,
};

const TOOL_NAMES: Record<string, string> = {
  web_search: "Web Search",
  file_analysis: "File Analysis",
  url_analysis: "URL Analysis",
  data_analysis: "Data Analysis",
  code_execution: "Code Execution",
  image_generation: "Image Generation",
  deep_research: "Deep Research",
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** Renders the result payload appropriate to each tool. */
function ToolResult({ call }: { call: ToolCallEvent }) {
  const data = call.data ?? {};

  if (
    call.toolId === "image_generation" &&
    typeof data.image === "string" &&
    // Only our own base64 payload or a plain http(s) URL. Anything else (a
    // javascript: or data:text/html value from a misbehaving provider) is
    // dropped rather than handed to the DOM.
    (data.image.startsWith("data:image/") || isValidHttpUrl(data.image))
  ) {
    return (
      // The payload is a data: URI or provider URL produced by our own backend.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={data.image}
        alt={typeof data.prompt === "string" ? data.prompt : "Generated image"}
        className="mt-2 max-h-96 w-auto rounded-lg border border-line"
      />
    );
  }

  if (call.toolId === "code_execution") {
    const logs = Array.isArray(data.logs) ? (data.logs as string[]) : [];
    const output = [logs.join("\n"), typeof data.error === "string" ? `Error: ${data.error}` : ""]
      .filter(Boolean)
      .join("\n");
    const value = typeof data.result === "string" ? data.result : "";
    if (!output && !value) return null;
    return (
      <pre className="mt-2 max-h-72 overflow-auto rounded-lg border border-line bg-surface p-3 text-xs leading-relaxed">
        {output ? `${output}\n` : ""}
        {value ? `⇒ ${value}` : ""}
      </pre>
    );
  }

  if (call.toolId === "data_analysis" && typeof data.rowCount === "number") {
    return (
      <p className="mt-2 text-xs text-muted">
        Profiled {data.rowCount.toLocaleString()} rows × {String(data.columnCount ?? "?")} columns
        {typeof data.name === "string" ? ` from ${data.name}` : ""}.
      </p>
    );
  }

  const safeSources = call.sources?.filter((source) => isValidHttpUrl(source.url));
  if (safeSources?.length) {
    return (
      <ul className="mt-2 space-y-1">
        {safeSources.slice(0, 8).map((source) => (
          <li key={source.url} className="truncate text-xs">
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="text-muted underline-offset-2 hover:text-fg hover:underline"
            >
              {source.title || hostOf(source.url)}
              <span className="ml-1 text-muted/70">({hostOf(source.url)})</span>
            </a>
          </li>
        ))}
      </ul>
    );
  }

  return null;
}

function ToolRow({ call }: { call: ToolCallEvent }) {
  const [open, setOpen] = useState(false);
  const name = TOOL_NAMES[call.toolId] ?? call.toolId;
  const icon = TOOL_ICONS[call.toolId] ?? <Zap className="h-3.5 w-3.5" aria-hidden />;
  const running = call.status === "running";
  const failed = call.status === "failed";
  const hasDetail = Boolean(call.data || call.sources?.length);


  return (
    <div className="rounded-lg border border-line bg-surface/50">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((value) => !value)}
        aria-expanded={hasDetail ? open : undefined}
        disabled={!hasDetail}
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left text-xs",
          hasDetail ? "cursor-pointer hover:bg-surface" : "cursor-default"
        )}
      >
        <span className={cn("shrink-0", failed ? "text-red-500" : "text-muted")}>{icon}</span>
        <span className="font-medium text-fg">{name}</span>
        {call.message ? <span className="truncate text-muted">· {call.message}</span> : null}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {typeof call.durationMs === "number" && !running ? (
            <span className="text-muted/70">{(call.durationMs / 1000).toFixed(1)}s</span>
          ) : null}
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-muted" aria-label="Running" />
          ) : failed ? (
            <AlertCircle className="h-3.5 w-3.5 text-red-500" aria-label="Failed" />
          ) : (
            <CheckCircle className="h-3.5 w-3.5 text-emerald-500" aria-label="Completed" />
          )}
          {hasDetail ? (
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted transition-transform", open && "rotate-180")} aria-hidden />
          ) : null}
        </span>
      </button>

      {running && typeof call.progress === "number" ? (
        <div className="mx-3 mb-2 h-0.5 overflow-hidden rounded bg-line">
          <div
            className="h-full bg-fg/40 transition-[width] duration-300"
            style={{ width: `${Math.round(Math.min(Math.max(call.progress, 0), 1) * 100)}%` }}
          />
        </div>
      ) : null}

      {open && hasDetail ? (
        <div className="border-t border-line px-3 pb-3 pt-2">
          <ToolResult call={call} />
        </div>
      ) : null}
    </div>
  );
}

/** The tool activity strip shown above an assistant message. */
export function ToolActivity({ calls, className }: { calls?: ToolCallEvent[]; className?: string }) {
  if (!calls?.length) return null;
  return (
    <div className={cn("mb-3 space-y-1.5", className)}>
      {calls.map((call) => (
        <ToolRow key={call.id} call={call} />
      ))}
    </div>
  );
}
