"use client";

import { useMemo } from "react";
import { Loader2, CheckCircle, AlertCircle, Search, FileText, Globe, Database, Code, Image as ImageIcon, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ToolProgress, ToolSource } from "@/lib/tools/types";

const TOOL_ICONS: Record<string, React.ReactNode> = {
  web_search: <Search className="h-4 w-4" aria-hidden />,
  file_analysis: <FileText className="h-4 w-4" aria-hidden />,
  url_analysis: <Globe className="h-4 w-4" aria-hidden />,
  data_analysis: <Database className="h-4 w-4" aria-hidden />,
  code_execution: <Code className="h-4 w-4" aria-hidden />,
  image_generation: <ImageIcon className="h-4 w-4" aria-hidden />,
  deep_research: <Zap className="h-4 w-4" aria-hidden />,
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

interface ToolActivityProps {
  toolId: string;
  progress: ToolProgress | null;
  isRunning: boolean;
  sources?: ToolSource[];
  className?: string;
}

export function ToolActivity({ toolId, progress, isRunning, sources, className }: ToolActivityProps) {
  const toolName = useMemo(() => TOOL_NAMES[toolId] ?? toolId, [toolId]);
  const toolIcon = useMemo(() => TOOL_ICONS[toolId] ?? <Loader2 className="h-4 w-4" aria-hidden />, [toolId]);

  if (!isRunning && !progress) return null;

  return (
    <div className={cn("rounded-xl border border-line bg-surface p-3 text-sm", className)}>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-muted">{toolIcon}</span>
        <span className="font-medium text-fg">{toolName}</span>
        {isRunning && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-accent">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Running
          </span>
        )}
        {!isRunning && progress?.progress === 100 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-success">
            <CheckCircle className="h-3 w-3" aria-hidden />
            Completed
          </span>
        )}
        {!isRunning && progress && progress.progress < 100 && progress.progress > 0 && (
          <span className="ml-auto inline-flex items-center gap-1 text-xs text-danger">
            <AlertCircle className="h-3 w-3" aria-hidden />
            Failed
          </span>
        )}
      </div>

      {progress && (
        <>
          <div className="mb-2 h-1.5 rounded-full bg-line overflow-hidden">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${Math.min(100, Math.max(0, progress.progress))}%` }}
              role="progressbar"
              aria-valuenow={progress.progress}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
          <p className="text-xs text-muted mb-2">{progress.message ?? progress.stage}</p>
        </>
      )}

      {sources && sources.length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-1.5 text-xs font-medium text-muted cursor-pointer">
            <span>Sources ({sources.length})</span>
            <span className="ml-auto text-accent">▼</span>
          </summary>
          <ul className="mt-2 space-y-1.5 pl-4 border-l border-line/50">
            {sources.map((source) => (
              <li key={source.url} className="text-xs text-muted">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-fg underline"
                >
                  {source.title}
                </a>
                <p className="line-clamp-2">{source.snippet}</p>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

interface MultiToolActivityProps {
  activities: Array<{
    toolId: string;
    progress: ToolProgress | null;
    isRunning: boolean;
    sources?: ToolSource[];
  }>;
  className?: string;
}

export function MultiToolActivity({ activities, className }: MultiToolActivityProps) {
  const runningActivities = activities.filter((a) => a.isRunning || (a.progress && a.progress.progress < 100));
  const completedActivities = activities.filter((a) => !a.isRunning && a.progress && a.progress.progress === 100);

  if (activities.length === 0) return null;

  return (
    <div className={cn("space-y-2", className)}>
      {runningActivities.map((activity) => (
        <ToolActivity
          key={activity.toolId}
          toolId={activity.toolId}
          progress={activity.progress}
          isRunning={activity.isRunning}
          sources={activity.sources}
        />
      ))}
      {completedActivities.map((activity) => (
        <ToolActivity
          key={activity.toolId}
          toolId={activity.toolId}
          progress={activity.progress}
          isRunning={false}
          sources={activity.sources}
        />
      ))}
    </div>
  );
}