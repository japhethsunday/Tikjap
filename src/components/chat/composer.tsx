"use client";

import { useCallback, useMemo, useRef, useState, useEffect,} from "react";
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
  seedText,
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
  /** Prefills the input once — used by Home's quick actions. */
  seedText?: string;
}) {
  const [value, setValue] = useState("");
  // Apply the seed exactly once, and never clobber something already typed.
  const seededRef = useRef(false);
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

  useEffect(() => {
    if (seededRef.current || !seedText) return;
    seededRef.current = true;
    setValue(seedText);
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      // Caret at the end so the user types straight into the seeded prompt.
      el.setSelectionRange(el.value.length, el.value.length);
      resize();
    });
  }, [seedText, resize]);

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

        {/*
          Two rows, not one. The tool chips are a wrapping flex row; sitting
          them beside the textarea meant seven chips wrapped to one per line,
          which stretched the composer vertically and squeezed the input down
          to a sliver. The textarea now owns the full width on its own row and
          the controls sit on a toolbar beneath it.
        */}
        <div className="px-3 pt-3">
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
            className="block max-h-48 min-h-[44px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-fg placeholder:text-muted/70 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>

        {/*
          Toolbar. The chips scroll horizontally rather than wrapping, so the
          composer keeps a fixed height however many tools a deployment has.
        */}
        <div className="flex items-center gap-2 px-2 pb-2 pt-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isStreaming}
            aria-label="Attach a file"
            className="shrink-0 rounded-lg p-2 text-muted transition-colors hover:bg-surface hover:text-fg disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Paperclip className="h-5 w-5" aria-hidden />
          </button>

          <div className="tk-scroll-x min-w-0 flex-1 py-0.5">
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
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <Dropdown
              placement="top"
              align="end"
              className="w-72"
              trigger={({ ref, "aria-expanded": expanded, toggle }) => (
                <button
                  ref={ref}
                  type="button"
                  aria-expanded={expanded}
                  aria-haspopup="listbox"
                  // The name is visually hidden below `sm`, so without this the
                  // control is an unlabelled icon button for screen readers and
                  // for anyone driving the app by voice.
                  aria-label={`Model: ${selectedModel?.name ?? "select a model"}`}
                  onClick={toggle}
                  disabled={disabled || isStreaming}
                  className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 text-sm font-medium text-fg transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Server className="h-3.5 w-3.5 text-muted" aria-hidden />
                  <span className="hidden max-w-28 truncate sm:inline">{selectedModel?.name ?? "Model"}</span>
                  <ChevronsUpDown className="h-3.5 w-3.5 text-muted" aria-hidden />
                </button>
              )}
            >
              {({ close }) => (
                <div role="listbox" aria-label="Select a model" className="w-64">
                  <p className="px-3 pb-1.5 pt-2 text-xs font-medium uppercase tracking-wide text-muted">
                    Choose a model
                  </p>
                  {/* The Dropdown already caps itself against the viewport, so
                      this only needs a generous ceiling — a hard max-h-60 hid
                      the last model even when there was room on screen. */}
                  <div className="max-h-[min(60vh,24rem)] overflow-y-auto">
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
              <Button size="sm" variant="secondary" onClick={onStop} aria-label="Stop generating">
                <Square className="h-4 w-4 fill-current" aria-hidden />
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={submit}
                disabled={!canSend}
                className="rounded-xl p-2.5"
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
