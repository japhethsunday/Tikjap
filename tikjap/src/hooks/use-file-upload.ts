"use client";

import { useRef, useState, useCallback } from "react";
import { api } from "@/lib/api";
import type { UploadedFile } from "@/lib/types";
import { errorMessage } from "@/lib/api";

export interface PendingAttachment {
  localId: string;
  file: File;
  progress: number;
  status: "uploading" | "uploaded" | "error";
  error?: string;
  uploaded?: UploadedFile;
}

export function useFileUpload({ onUploaded }: { onUploaded?: (attachment: PendingAttachment) => void } = {}) {
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const abortRefs = useRef(new Map<string, AbortController>());

  const update = useCallback((localId: string, patch: Partial<PendingAttachment>) => {
    setAttachments((current) => current.map((a) => (a.localId === localId ? { ...a, ...patch } : a)));
  }, []);

  const addFiles = useCallback(
    (files: File[]) => {
      const validFiles = files.filter((file) => file.size > 0);
      if (!validFiles.length) return;
      for (const file of validFiles) {
        const localId = `${file.name}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const controller = new AbortController();
        abortRefs.current.set(localId, controller);
        setAttachments((current) => [
          ...current,
          { localId, file, progress: 0, status: "uploading" },
        ]);
        api.files
          .upload(file, {
            onProgress: (percent) => update(localId, { progress: percent }),
            signal: controller.signal,
          })
          .then(({ file: uploaded }) => {
            const pending = { localId, file, progress: 100, status: "uploaded", uploaded } as PendingAttachment;
            setAttachments((current) => current.map((a) => (a.localId === localId ? pending : a)));
            onUploaded?.(pending);
          })
          .catch((error: unknown) => {
            if (controller.signal.aborted) {
              setAttachments((current) => current.filter((a) => a.localId !== localId));
              return;
            }
            update(localId, { status: "error", error: errorMessage(error) });
          })
          .finally(() => abortRefs.current.delete(localId));
      }
    },
    [onUploaded, update]
  );

  const remove = useCallback((localId: string) => {
    abortRefs.current.get(localId)?.abort();
    abortRefs.current.delete(localId);
    setAttachments((current) => current.filter((a) => a.localId !== localId));
  }, []);

  const clear = useCallback(() => {
    abortRefs.current.forEach((controller) => controller.abort());
    abortRefs.current.clear();
    setAttachments([]);
  }, []);

  const uploadedIds = attachments
    .filter((a) => a.status === "uploaded" && a.uploaded)
    .map((a) => a.uploaded!.id);

  const hasUploading = attachments.some((a) => a.status === "uploading");
  const hasErrors = attachments.some((a) => a.status === "error");

  return { attachments, addFiles, remove, clear, uploadedIds, hasUploading, hasErrors, update };
}