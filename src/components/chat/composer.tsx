"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { ArrowUp, Paperclip, Square, Slash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentChip } from "./attachment-chip";
import { useFileUpload } from "@/hooks/use-file-upload";
import { useSavedPrompts } from "@/hooks/use-platform";
import { MAX_ATTACHMENTS_PER_MESSAGE, isAllowedFile, MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { estimateTokens, cn } from "@/lib/utils";
import { useToast } from "@/components/providers/toast";

export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  disabledReason,
  allowImages,
  className,
}: {
  onSend: (content: string, attachmentIds: string[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  disabledReason?: string;
  allowImages: boolean;
  className?: string;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { attachments, addFiles, remove, uploadedIds, hasUploading, hasErrors } = useFileUpload();
  const { data: promptsData } = useSavedPrompts();
  const savedPrompts = useMemo(() => promptsData?.prompts ?? [], [promptsData]);

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

        <p className="flex items-center justify-center gap-2 px-4 pb-2 text-[11px] text-muted">
          <span>Enter to send • Shift+Enter for a new line{attachments.length ? ` • ${attachments.length}/${MAX_ATTACHMENTS_PER_MESSAGE} attachments` : ""}</span>
          {tokenCount > 20 ? <span aria-label="Estimated tokens">· ~{tokenCount.toLocaleString()} tokens</span> : null}
        </p>
      </div>
    </div>
  );
}
