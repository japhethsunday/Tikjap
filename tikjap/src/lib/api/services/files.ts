import type { ApiClient } from "../client";
import type { UploadedFile } from "../../types";

export function createFilesService(client: ApiClient) {
  return {
    upload(file: File, options: { onProgress?: (percent: number) => void; signal?: AbortSignal } = {}): Promise<{ file: UploadedFile }> {
      return client.upload("/files", file, options);
    },
    get(id: string): Promise<{ file: UploadedFile }> {
      return client.get(`/files/${id}`);
    },
    remove(id: string): Promise<void> {
      return client.delete(`/files/${id}`);
    },
    contentUrl(id: string): string {
      return `/api/v1/files/${id}/content`;
    },
  };
}

export type FilesService = ReturnType<typeof createFilesService>;