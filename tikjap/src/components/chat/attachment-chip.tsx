"use client";

import { FileText, FileSpreadsheet, File as FileIcon, FileImage, FileArchive, X, Loader2, AlertTriangle } from "lucide-react";
import { formatBytes } from "@/lib/utils";
import type { PendingAttachment } from "@/hooks/use-file-upload";

const KIND_ICON: Record<string, React.ReactNode> = {
  text: <FileText className="h-4 w-4 text-accent" aria-hidden />,
  image: <FileImage className="h-4 w-4 text-accent" aria-hidden />,
  pdf: <FileText className="h-4 w-4 text-danger" aria-hidden />,
  spreadsheet: <FileSpreadsheet className="h-4 w-4 text-success" aria-hidden />,
  archive: <FileArchive className="h-4 w-4 text-muted" aria-hidden />,
  other: <FileIcon className="h-4 w-4 text-muted" aria-hidden />,
};

export function AttachmentChip({
  attachment,
  onRemove,
  previewUrl,
}: {
  attachment: PendingAttachment;
  onRemove: (localId: string) => void;
  previewUrl?: (fileId: string) => string;
}) {
  const kind = attachment.uploaded?.kind ?? "other";
  const isImage = kind === "image" && attachment.status === "uploaded";
  const previewSrc = isImage && attachment.uploaded ? previewUrl?.(attachment.uploaded.id) : undefined;

  return (
    <div className="tk-fade-in flex items-center gap-2.5 rounded-lg border border-line bg-surface px-3 py-2">
      {previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={previewSrc} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
      ) : (
        <span className="shrink-0">{KIND_ICON[kind]}</span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{attachment.file.name}</p>
        <div className="flex items-center gap-2 text-xs text-muted">
          {attachment.status === "uploading" ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Uploading {attachment.progress}%
              <span className="h-1 w-16 overflow-hidden rounded-full bg-line">
                <span
                  className="block h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${attachment.progress}%` }}
                />
              </span>
            </>
          ) : attachment.status === "error" ? (
            <span className="flex items-center gap-1 text-danger">
              <AlertTriangle className="h-3 w-3" aria-hidden />
              {attachment.error ?? "Upload failed"}
            </span>
          ) : (
            <>
              {formatBytes(attachment.file.size)}
              <span aria-hidden>•</span>
              Ready
            </>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onRemove(attachment.localId)}
        aria-label={`Remove ${attachment.file.name}`}
        className="shrink-0 rounded-md p-1 text-muted transition-colors hover:bg-line/40 hover:text-fg"
      >
        <X className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}