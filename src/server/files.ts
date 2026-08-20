import { promises as fs } from "node:fs";
import path from "node:path";
import { getData, persist, uid, nowISO, uploadsDir, ensureUploadsDir, type FileRecord } from "./db";
import { HttpError } from "./http";
import { ALLOWED_FILE_EXTENSIONS, MAX_FILE_SIZE_BYTES, fileKindFromExtension, getFileExtension } from "@/lib/constants";

export async function handleFileUpload(userId: string, formData: FormData): Promise<{ file: FileRecord }> {
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

  const buffer = Buffer.from(await raw.arrayBuffer());
  const fileId = uid();
  const safeName = path.basename(raw.name).replace(/[^\w.\- ()]/g, "_").slice(0, 200);
  await ensureUploadsDir();
  const userDir = path.join(uploadsDir, userId);
  await fs.mkdir(userDir, { recursive: true });
  await fs.writeFile(path.join(userDir, `${fileId}-${safeName}`), buffer);

  const record: FileRecord = {
    id: fileId,
    userId,
    name: safeName,
    size: raw.size,
    mimeType: raw.type || "application/octet-stream",
    kind: fileKindFromExtension(extension),
    savedName: `${fileId}-${safeName}`,
    createdAt: nowISO(),
  };
  const store = await getData();
  store.files.push(record);
  await persist();
  return { file: record };
}

export async function getFileMeta(userId: string, fileId: string): Promise<FileRecord> {
  const store = await getData();
  const file = store.files.find((f) => f.id === fileId && f.userId === userId);
  if (!file) throw new HttpError(404, "not_found", "File not found.");
  return file;
}

export async function readFileContent(userId: string, fileId: string): Promise<{ buffer: Buffer; contentType: string; name: string }> {
  const file = await getFileMeta(userId, fileId);
  try {
    const buffer = await fs.readFile(path.join(uploadsDir, userId, file.savedName));
    return { buffer, contentType: file.mimeType, name: file.name };
  } catch {
    throw new HttpError(404, "not_found", "File content is unavailable.");
  }
}

export async function deleteFile(userId: string, fileId: string): Promise<void> {
  const store = await getData();
  const file = store.files.find((f) => f.id === fileId && f.userId === userId);
  if (!file) throw new HttpError(404, "not_found", "File not found.");
  store.files = store.files.filter((f) => f.id !== fileId);
  try {
    await fs.rm(path.join(uploadsDir, userId, file.savedName), { force: true });
  } catch {
    // best-effort removal from disk
  }
  await persist();
}

export function publicFile(file: FileRecord) {
  return {
    id: file.id,
    name: file.name,
    size: file.size,
    mimeType: file.mimeType,
    kind: file.kind,
    createdAt: file.createdAt,
  };
}