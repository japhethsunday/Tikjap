"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowUp, Paperclip, Square, Slash, Server, Check, ChevronsUpDown, Eye, FileText, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentChip } from "./attachment-chip";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useSavedPrompts } from "@/hooks/use-platform";
import { useModels } from "@/hooks/use-models";
import { MAX_ATTACHMENTS_PER_MESSAGE, isAllowedFile, MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { estimateTokens, cn } from "@/lib/utils";
import { useToast } from "@/components/providers/toast";
import { Dropdown } from "@/components/ui/overlays";
import { ToolToggles } from "@/components/tools/tool-selector";
import type { ModelCapabilities, ToolAvailability, ToolPermission } from "@/lib/types";

const CAPABILITY_ICONS: Array<{ key: keyof ModelCapabilities; label: string; icon: React.ReactNode }> = [
  { key: "vision", label: "Vision", icon: <Eye className="h-3 w-3" aria-hidden /> },
  { key: "files", label: "Documents", icon: <FileText className="h-3 w-3" aria-hidden /> },
  { key: "toolUse", label: "Tools", icon: <Zap className="h-3 w-3" aria-hidden /> },
];

export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  disabledReason,
  allowImages,
  className,
  modelId,
  onModelChange,
  enabledTools = [],
  onToolsChange,
  toolAvailability,
}: {
  onSend: (content: string, attachmentIds: string[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  disabledReason?: string;
  allowImages: boolean;
  className?: string;
  modelId: string;
  onModelChange: (modelId: string) => void;
  enabledTools?: ToolPermission[];
  onToolsChange?: (tools: ToolPermission[]) => void;
  toolAvailability?: ToolAvailability[];
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { attachments, addFiles, remove, uploadedIds, hasUploading, hasErrors } = useFileUpload();
  const { data: promptsData } = useSavedPrompts();
  const { data: modelsData } = useModels();
  const savedPrompts = useMemo(() => promptsData?.prompts ?? [], [promptsData]);
  const models = modelsData?.models ?? [];
  const selectedModel = models.find((m) => m.id === modelId);

  const slashActive = value.startsWith("/");
  const slashQuery = slashActive ? value.slice(1).trim().toLowerCase() : "";
  const slashMatches = useMemo(() => {
    if (!slashActive) return [];
    return savedPrompts
      .filter((prompt) =>
        slashQuery
          ? prompt.title.toLowerCase().includes(slashQuery) || prompt.body.toLowerCase().includes(slashQuery)
          : true
      )
      .slice(0, 6);
  }, [slashActive, slashQuery, savedPrompts]);

  const tokenCount = useMemo(() => estimateTokens(value), [value]);
  const canSend = !disabled && !hasUploading && !hasErrors && (value.trim().length > 0 || attachments.length > 0);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

  const applyPrompt = useCallback((body: string) => {
    const variables = [...new Set(Array.from(body.matchAll(/\{\{\s*([\w.-]+)\s*\}\}/g)).map((m) => m[1]))];
    let filled = body;
    for (const variable of variables.slice(0, 8)) {
      const answer = window.prompt(`Value for "${variable}":`, "") ?? "";
      filled = filled.replaceAll(new RegExp(`\\{\\{\\s*${variable.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\}\\}`, "g"), answer.trim() || `{{${variable}}}`);
    }
    setValue(filled);
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
        resize();
      }
    });
  }, [resize]);

  const submit = useCallback(() => {
    if (!canSend || isStreaming) return;
    const text = value.trim();
    const fileIds = uploadedIds;
    onSend(text, fileIds);
    setValue("");
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
        textareaRef.current.focus();
      }
    });
  }, [canSend, isStreaming, value, uploadedIds, onSend]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (slashMatches.length > 0) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        return;
      }
      if (event.key === "Escape") {
        setValue("");
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  const pickFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const incoming = Array.from(files);
    if (attachments.length + incoming.length > MAX_ATTACHMENTS_PER_MESSAGE) {
      toast({
        kind: "error",
        title: `Up to ${MAX_ATTACHMENTS_PER_MESSAGE} attachments per message`,
      });
      return;
    }
    const invalid = incoming.find((file) => !isAllowedFile(file.name));
    if (invalid) {
      toast({ kind: "error", title: `"${invalid.name}" is not a supported file type` });
      return;
    }
    if (!allowImages) {
      const image = incoming.find((file) => ["image/"].some((p) => file.type.startsWith(p)));
      if (image) {
        toast({ kind: "error", title: "This model does not support images" });
        return;
      }
    }
    const oversized = incoming.find((file) => file.size > MAX_FILE_SIZE_BYTES);
    if (oversized) {
      toast({ kind: "error", title: "File exceeds the 10 MB limit" });
      return;
    }
    addFiles(incoming);
  };

  return (
    <div className={cn("mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6", className)} data-print-hide>
      <div className="relative rounded-2xl border border-line bg-elevated shadow-sm transition-shadow focus-within:border-accent/60 focus-within:shadow-md">
        {slashMatches.length > 0 ? (
          <div
            role="listbox"
            aria-label="Saved prompts"
            className="absolute bottom-full left-0 right-0 mb-2 overflow-hidden rounded-xl border border-line bg-elevated shadow-lg"
          >
            {savedPrompts.length === 0 ? (
              <p className="px-4 py-3 text-xs text-muted">
                No saved prompts yet — create them in Settings → Intelligence.
              </p>
            ) : (
              slashMatches.map((prompt) => (
                <button
                  key={prompt.id}
                  type="button"
                  role="option"
                  aria-selected
                  onClick={() => {
                    setValue("");
                    applyPrompt(prompt.body);
                  }}
                  className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-surface"
                >
                  <span className="flex items-center gap-2 text-sm font-medium text-fg">
                    <Slash className="h-3 w-3 text-muted" aria-hidden />
                    {prompt.title}
                  </span>
                  <span className="mt-0.5 line-clamp-1 block text-xs text-muted">{prompt.body}</span>
                </button>
              ))
            )}
          </div>
        ) : null}

        {attachments.length > 0 ? (
          <div className="flex flex-wrap gap-2 px-3 pt-3" aria-label="Attachments">
            {attachments.map((attachment) => (
              <AttachmentChip key={attachment.localId} attachment={attachment} onRemove={remove} previewUrl={(id) => `/api/v1/files/${id}/content`} />
            ))}
          </div>
        ) : null}

        <div className="flex items-end gap-2 p-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.txt,.md,.markdown,.docx,.csv,.json,.png,.jpg,.jpeg,.gif,.webp"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              pickFiles(event.target.files);
              event.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
            aria-label="Attach a file"
            className="mb-0.5 rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" aria-hidden />
          </button>

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              resize();
            }}
            onKeyDown={handleKeyDown}
            rows={1}
            placeholder={disabledReason ?? "Ask anything… Type / for saved prompts"}
            disabled={disabled}
            aria-label="Message"
            className="max-h-50 min-h-[40px] flex-1 resize-none bg-transparent px-1 py-2 text-[15px] leading-relaxed text-fg placeholder:text-muted/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />

          <div className="flex items-center gap-1.5 mb-0.5">
            <ToolToggles
              availability={toolAvailability}
              enabledTools={enabledTools}
              onToggle={(toolId, enabled) => {
                const next = enabled
                  ? [...enabledTools, toolId]
                  : enabledTools.filter((t) => t !== toolId);
                onToolsChange?.(next);
              }}
              disabled={disabled || isStreaming}
            />
            <Dropdown
              trigger={({ ref, "aria-expanded": expanded, toggle }) => (
                <button
                  ref={ref}
                  type="button"
                  aria-expanded={expanded}
                  aria-haspopup="listbox"
                  onClick={toggle}
                  disabled={disabled || isStreaming}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Server className="h-3.5 w-3.5 text-muted" aria-hidden />
                  <span className="hidden sm:inline">{selectedModel?.name ?? "Model"}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted" aria-hidden />
                </button>
              )}
            >
              {({ close }) => (
                <div role="listbox" aria-label="Select a model" className="w-64">
                  <p className="px-3 pb-1.5 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Choose a model
                  </p>
                  <div className="max-h-60 overflow-y-auto">
                    {models.map((model) => (
                      <button
                        key={model.id}
                        type="button"
                        role="option"
                        aria-selected={model.id === modelId}
                        onClick={() => {
                          onModelChange(model.id);
                          close();
                        }}
                        disabled={disabled || isStreaming}
                        className={cn(
                          "flex w-full items-start gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
                          model.id === modelId ? "bg-surface" : "hover:bg-surface/60",
                          (disabled || isStreaming) && "opacity-50 cursor-not-allowed"
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
                          <p className="mt-0.5 line-clamp-1 text-xs text-muted">{model.description}</p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
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
                        {model.id === modelId ? <Check className="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden /> : null}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </Dropdown>

            {isStreaming ? (
              <Button size="sm" variant="secondary" onClick={onStop} className="mb-0.5" aria-label="Stop generating">
                <Square className="h-4 w-4 fill-current" aria-hidden />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={submit}
                disabled={!canSend}
                className="mb-0.5 rounded-xl p-2.5"
                aria-label="Send message"
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </Button>
            )}
          </div>
        </div>

        <p className="flex items-center justify-center gap-2 px-4 pb-2 text-[11px] text-muted">
          <span>Enter to send • Shift+Enter for a new line{attachments.length ? ` • ${attachments.length}/${MAX_ATTACHMENTS_PER_MESSAGE} attachments` : ""}</span>
          {tokenCount > 20 ? <span aria-label="Estimated tokens">· ~{tokenCount.toLocaleString()} tokens</span> : null}
        </p>
      </div>
    </div>
  );
}
