"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { errorMessage } from "@/lib/api";
import { useAiPreferences, useModels } from "@/hooks/use-models";
import { useToast } from "@/components/providers/toast";
import { Button, Card, Select, Switch, Skeleton } from "@/components/ui";
import type { AiPreferences } from "@/lib/types";

export default function AiPreferencesPage() {
  const { data: preferencesData, isLoading, refetch } = useAiPreferences();
  const { data: modelsData } = useModels();
  const { toast } = useToast();
  const [draft, setDraft] = useState<Partial<AiPreferences> | null>(null);
  const [saving, setSaving] = useState(false);

  if (isLoading || !preferencesData) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const current = draft ? { ...preferencesData.preferences, ...draft } : preferencesData.preferences;
  const dirty = draft !== null;
  const models = modelsData?.models ?? [];

  const save = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      const updated = await api.settings.updatePreferences(draft);
      setDraft(null);
      void refetch();
      toast({ kind: "success", title: "Preferences saved" });
      void updated;
    } catch (error) {
      toast({ kind: "error", title: "Could not save preferences", description: errorMessage(error) });
    } finally {
      setSaving(false);
    }
  };

  const patch = (partial: Partial<AiPreferences>) => {
    setDraft((currentDraft) => ({ ...(currentDraft ?? {}), ...partial }));
  };

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Default model</h2>
        <p className="mt-1 text-sm text-muted">Used when you start a new conversation.</p>
        <div className="mt-4 max-w-sm">
          <Select
            value={current.defaultModelId ?? ""}
            onChange={(event) => patch({ defaultModelId: event.target.value || null })}
            aria-label="Default model"
          >
            <option value="">Auto (model default)</option>
            {models.map((model) => (
              <option key={model.id} value={model.id}>
                {model.name}
              </option>
            ))}
          </Select>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-base font-semibold text-fg">Response preferences</h2>
        <div className="mt-4 space-y-5">
          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="temperature" className="text-sm font-medium text-fg">
                Temperature: <span className="font-mono text-accent">{current.temperature?.toFixed(1)}</span>
              </label>
            </div>
            <input
              id="temperature"
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={current.temperature ?? 0.7}
              onChange={(event) => patch({ temperature: Number(event.target.value) })}
              className="mt-3 w-full accent-[var(--accent)]"
            />
            <p className="mt-1 text-xs text-muted">Lower is more focused, higher is more creative.</p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-fg">Render markdown</p>
              <p className="text-xs text-muted">Format responses with headings, code, and tables.</p>
            </div>
            <Switch checked={Boolean(current.markdown)} onCheckedChange={(checked) => patch({ markdown: checked })} label="Render markdown" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-fg">Show timestamps</p>
              <p className="text-xs text-muted">Display a time beside each message.</p>
            </div>
            <Switch checked={Boolean(current.showTimestamps)} onCheckedChange={(checked) => patch({ showTimestamps: checked })} label="Show timestamps" />
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-fg">Stream responses</p>
              <p className="text-xs text-muted">Reveal answers token by token as they are generated.</p>
            </div>
            <Switch checked={Boolean(current.streamingEnabled)} onCheckedChange={(checked) => patch({ streamingEnabled: checked })} label="Stream responses" />
          </div>
        </div>
      </Card>

      <div className="flex justify-end">
        <Button onClick={save} loading={saving} disabled={!dirty}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}