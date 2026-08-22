"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Download, HardDrive, Trash2, Upload } from "lucide-react";
import { Card, Button } from "@/components/ui";
import { useToast } from "@/components/providers/toast";
import {
  useSchedules,
  useCreateSchedule,
  useToggleSchedule,
  useDeleteSchedule,
  useSavedPrompts,
  useStorageUsage,
} from "@/hooks/use-platform";
import { api } from "@/lib/api";
import { formatBytes, timeAgo } from "@/lib/utils";

export default function DataPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: schedulesData } = useSchedules();
  const { data: promptsData } = useSavedPrompts();
  const createSchedule = useCreateSchedule();
  const toggleSchedule = useToggleSchedule();
  const deleteSchedule = useDeleteSchedule();
  const { data: storage } = useStorageUsage();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [exporting, setExporting] = useState(false);
  const schedules = schedulesData?.schedules ?? [];
  const prompts = promptsData?.prompts ?? [];

  const exportAll = async () => {
    setExporting(true);
    try {
      const bundle = await api.workspace.exportAll();
      const blob = new Blob([JSON.stringify(bundle, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tikjap-export-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast({ kind: "success", title: "Export downloaded" });
    } catch (error) {
      toast({ kind: "error", title: "Export failed", description: error instanceof Error ? error.message : "Try again." });
    } finally {
      setExporting(false);
    }
  };

  const importChatGPT = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text());
      const result = await api.workspace.importChatGPT(payload);
      toast({ kind: "success", title: `Imported ${result.imported} conversations` });
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
    } catch (error) {
      toast({
        kind: "error",
        title: "Import failed",
        description: error instanceof Error ? error.message : "Expected a ChatGPT conversations.json export.",
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <HardDrive className="h-4 w-4" aria-hidden />
          File storage
        </h2>
        {storage ? (
          <>
            <div
              className="mt-3 h-2 w-full overflow-hidden rounded-full bg-elevated"
              role="progressbar"
              aria-valuenow={Math.round((storage.usedBytes / Math.max(1, storage.capBytes)) * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full transition-all ${
                  storage.usedBytes / Math.max(1, storage.capBytes) > 0.9 ? "bg-danger" : "bg-accent"
                }`}
                style={{ width: `${Math.min(100, (storage.usedBytes / Math.max(1, storage.capBytes)) * 100).toFixed(1)}%` }}
              />
            </div>
            <p className="mt-2 text-xs text-muted">
              {formatBytes(storage.usedBytes)} of {formatBytes(storage.capBytes)} used · {storage.fileCount} file{storage.fileCount === 1 ? "" : "s"}
            </p>
          </>
        ) : (
          <p className="mt-2 text-xs text-muted">Loading usage…</p>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-fg">
          <Calendar className="h-4 w-4" aria-hidden />
          Scheduled prompts
        </h2>
        <p className="mt-1 text-xs text-muted">Run a saved prompt on a cadence. Results land in new conversations.</p>

        {prompts.length === 0 ? (
          <p className="mt-4 rounded-xl border border-dashed border-line px-3 py-4 text-center text-xs text-muted">
            Create saved prompts first in Settings → Intelligence.
          </p>
        ) : (
          <form
            className="mt-4 flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const select = form.elements.namedItem("promptId") as HTMLSelectElement;
              const cadenceSelect = form.elements.namedItem("cadence") as HTMLSelectElement;
              if (!select.value) return;
              createSchedule.mutate(
                { promptId: select.value, cadence: cadenceSelect.value },
                {
                  onSuccess: () => toast({ kind: "success", title: "Scheduled" }),
                  onError: (error) => toast({ kind: "error", title: "Could not schedule", description: error instanceof Error ? error.message : "" }),
                }
              );
            }}
          >
            <label className="min-w-48 flex-1 text-xs text-muted">
              Prompt
              <select name="promptId" className="mt-1 w-full rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-fg">
                {prompts.map((prompt) => (
                  <option key={prompt.id} value={prompt.id}>
                    {prompt.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-muted">
              Cadence
              <select name="cadence" defaultValue="daily" className="mt-1 block rounded-lg border border-line bg-canvas px-2.5 py-2 text-sm text-fg">
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="weekdays">Weekdays</option>
              </select>
            </label>
            <Button type="submit" disabled={createSchedule.isPending}>
              Schedule
            </Button>
          </form>
        )}

        {schedules.length > 0 ? (
          <ul className="mt-4 space-y-1.5">
            {schedules.map((schedule) => (
              <li key={schedule.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2">
                <input
                  type="checkbox"
                  checked={schedule.active}
                  onChange={(event) =>
                    toggleSchedule.mutate(
                      { id: schedule.id, active: event.target.checked },
                      { onError: () => toast({ kind: "error", title: "Update failed" }) }
                    )
                  }
                  aria-label={`${schedule.active ? "Pause" : "Resume"} schedule`}
                  className="h-4 w-4 accent-[var(--accent)]"
                />
                <span className="min-w-0 flex-1 truncate text-sm text-fg">
                  {prompts.find((prompt) => prompt.id === schedule.promptId)?.title ?? schedule.promptId}
                </span>
                <span className="shrink-0 text-[11px] uppercase tracking-wide text-muted">{schedule.cadence}</span>
                <span className="hidden shrink-0 text-[11px] text-muted sm:block">next {timeAgo(schedule.nextRun)}</span>
                <button
                  type="button"
                  aria-label="Delete schedule"
                  onClick={() =>
                    deleteSchedule.mutate(schedule.id, {
                      onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["schedules"] }),
                    })
                  }
                  className="rounded-md p-1 text-muted hover:bg-danger/10 hover:text-danger"
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-semibold text-fg">Import &amp; export</h2>
        <p className="mt-1 text-xs text-muted">Take your data anywhere — or bring your ChatGPT history with you.</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void exportAll()} disabled={exporting}>
            <Download className="mr-1.5 inline h-4 w-4" aria-hidden />
            {exporting ? "Preparing…" : "Export everything (JSON)"}
          </Button>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            <Upload className="mr-1.5 inline h-4 w-4" aria-hidden />
            Import ChatGPT export
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void importChatGPT(file);
              event.target.value = "";
            }}
          />
        </div>
      </Card>
    </div>
  );
}
