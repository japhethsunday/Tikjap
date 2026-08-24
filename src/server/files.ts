import { HttpError } from "./errors";
import { deleteFileRecord, getFile, insertFile, listFiles, uid, type FileRow } from "./store";
import { createServiceClient } from "./supabase";
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_SIZE_BYTES, fileKindFromExtension, getFileExtension } from "@/lib/constants";

const BUCKET = "uploads";

/**
 * Canonical content type per allowed extension. The client-supplied Content-Type
 * header is never trusted — it is ignored in favor of this mapping so a `.txt`
 * upload can never be stored or served as `text/html` (stored-XSS protection).
 */
const CANONICAL_MIME_BY_EXTENSION: Record<string, string> = {
  pdf: "application/pdf",
  txt: "text/plain; charset=utf-8",
  md: "text/markdown; charset=utf-8",
  markdown: "text/markdown; charset=utf-8",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  csv: "text/csv; charset=utf-8",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

export function canonicalMimeType(extension: string): string {
  return CANONICAL_MIME_BY_EXTENSION[extension] ?? "application/octet-stream";
}

/**
 * Only formats browsers can safely render inline are served inline; everything
 * else is force-downloaded so HTML/SVG-like payloads never execute on our origin.
 */
export function shouldServeInline(contentType: string): boolean {
  return contentType.startsWith("image/") || contentType === "application/pdf";
}

export async function handleFileUpload(userId: string, formData: FormData): Promise<{ file: FileRow }> {
  const raw = formData.get("file");
  if (!(raw instanceof File)) {
    throw new HttpError(400, "validation", "No file was provided.");
  }
  const extension = getFileExtension(raw.name);
  if (!(ALLOWED_FILE_EXTENSIONS as readonly string[]).includes(extension)) {
    throw new HttpError(
      400,
      "unsupported_file",
      `"${extension || "unknown extension"}" files are not supported. Allowed: ${ALLOWED_FILE_EXTENSIONS.join(", ")}.`
    );
  }
  if (raw.size <= 0) {
    throw new HttpError(400, "validation", "The uploaded file is empty.");
  }
  if (raw.size > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(400, "file_too_large", "File exceeds the 10 MB size limit.");
  }

  const safeName = raw.name.replace(/[^\w.\- ()]/g, "_").slice(0, 200);
  const fileId = uid();
  const storagePath = `${userId}/${fileId}-${safeName}`;
  const contentType = canonicalMimeType(extension);
  const buffer = Buffer.from(await raw.arrayBuffer());

  const db = createServiceClient();
  const { error: uploadError } = await db.storage.from(BUCKET).upload(storagePath, buffer, {
    contentType,
    upsert: false,
  });
  if (uploadError) {
    console.error("[files/upload]", uploadError.message);
    throw new HttpError(500, "internal", "Could not store the file. Please try again.");
  }

  const record = await insertFile({
    id: fileId,
    user_id: userId,
    name: safeName,
    size: raw.size,
    mime_type: contentType,
    kind: fileKindFromExtension(extension),
    storage_path: storagePath,
  });
  return { file: record };
}

export async function getFileMeta(userId: string, fileId: string): Promise<FileRow> {
  return getFile(userId, fileId);
}

export async function readFileContent(
  userId: string,
  fileId: string
): Promise<{ buffer: Buffer; contentType: string; name: string }> {
  const file = await getFile(userId, fileId);
  const db = createServiceClient();
  const { data, error } = await db.storage.from(BUCKET).download(file.storage_path);
  if (error || !data) throw new HttpError(404, "not_found", "File content is unavailable.");
  return { buffer: Buffer.from(await data.arrayBuffer()), contentType: file.mime_type, name: file.name };
}

export async function deleteFile(userId: string, fileId: string): Promise<void> {
  const file = await getFile(userId, fileId);
  await deleteFileRecord(userId, fileId);
  await dbStorageRemove(file.storage_path);
}

async function dbStorageRemove(storagePath: string): Promise<void> {
  const db = createServiceClient();
  await db.storage.from(BUCKET).remove([storagePath]).catch(() => undefined);
}

export function publicFile(file: FileRow) {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mime_type,
    kind: file.kind,
    createdAt: file.created_at,
  };
}

export async function listUserFiles(userId: string, limit?: number): Promise<FileRow[]> {
  return listFiles(userId, limit);
}
