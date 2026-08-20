"use client";

import { useCallback, useRef, useState } from "react";
import { ArrowUp, Paperclip, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AttachmentChip } from "./attachment-chip";
import { useFileUpload } from "@/hooks/use-file-upload";
import { MAX_ATTACHMENTS_PER_MESSAGE, isAllowedFile, MAX_FILE_SIZE_BYTES } from "@/lib/constants";
import { useToast } from "@/components/providers/toast";

export function Composer({
  onSend,
  onStop,
  isStreaming,
  disabled,
  disabledReason,
  allowImages,
}: {
  onSend: (content: string, attachmentIds: string[]) => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled?: boolean;
  disabledReason?: string;
  allowImages: boolean;
}) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { attachments, addFiles, remove, uploadedIds, hasUploading, hasErrors } = useFileUpload();

  const canSend = !disabled && !hasUploading && !hasErrors && (value.trim().length > 0 || attachments.length > 0);

  const resize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, []);

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
    <div className="mx-auto w-full max-w-3xl px-4 pb-4 sm:px-6">
      <div className="rounded-2xl border border-line bg-elevated shadow-sm transition-shadow focus-within:border-accent/60 focus-within:shadow-md">
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
            placeholder={disabledReason ?? "Ask anything…"}
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

        <p className="px-4 pb-2 text-center text-[11px] text-muted">
          Enter to send • Shift+Enter for a new line{attachments.length ? ` • ${attachments.length}/${MAX_ATTACHMENTS_PER_MESSAGE} attachments` : ""}
        </p>
      </div>
    </div>
  );
}