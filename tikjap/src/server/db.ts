import { promises as fs } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { ChatMessage, Role } from "@/lib/types";

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  passwordHash: string;
  passwordSalt: string;
  avatarUrl?: string;
  createdAt: string;
  lastActiveAt: string;
}

export interface SessionRecord {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  userAgent?: string;
  ip?: string;
}

export interface ConversationRecord {
  id: string;
  userId: string;
  title: string;
  model: string;
  createdAt: string;
  updatedAt: string;
}

export interface FileRecord {
  id: string;
  userId: string;
  name: string;
  size: number;
  mimeType: string;
  kind: string;
  savedName: string;
  createdAt: string;
}

export interface PasswordResetRecord {
  tokenHash: string;
  userId: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

export interface DayUsage {
  userId: string;
  day: string;
  messages: number;
  tokens: number;
  inputTokens: number;
  outputTokens: number;
}

export interface RequestLog {
  id: string;
  userId: string;
  modelId: string;
  ok: boolean;
  tokens: number;
  createdAt: string;
}

export interface PreferenceRecord {
  userId: string;
  defaultModelId: string | null;
  temperature: number;
  markdown: boolean;
  showTimestamps: boolean;
  streamingEnabled: boolean;
}

export interface DbData {
  users: UserRecord[];
  sessions: SessionRecord[];
  conversations: ConversationRecord[];
  messages: ChatMessage[];
  files: FileRecord[];
  resets: PasswordResetRecord[];
  usage: DayUsage[];
  requestLogs: RequestLog[];
  preferences: PreferenceRecord[];
}

const DATA_DIR = path.join(process.cwd(), ".data");
const DB_FILE = path.join(DATA_DIR, "db.json");

export function uid(): string {
  return crypto.randomUUID();
}

export function nowISO(): string {
  return new Date().toISOString();
}

export function todayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

export function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = (await scrypt(password, salt, 64)).toString("hex");
  return { hash, salt };
}

export async function verifyPassword(password: string, salt: string, expected: string): Promise<boolean> {
  const hash = await scrypt(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return hash.length === expectedBuffer.length && crypto.timingSafeEqual(hash, expectedBuffer);
}

function scrypt(password: string, salt: string, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, keylen, (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

function emptyData(): DbData {
  return {
    users: [],
    sessions: [],
    conversations: [],
    messages: [],
    files: [],
    resets: [],
    usage: [],
    requestLogs: [],
    preferences: [],
  };
}

let data: DbData | null = null;
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export async function getData(): Promise<DbData> {
  if (data) return data;
  try {
    const raw = await fs.readFile(DB_FILE, "utf8");
    data = { ...emptyData(), ...(JSON.parse(raw) as Partial<DbData>) };
  } catch {
    data = emptyData();
    await persist();
  }
  return data;
}

export async function persist(): Promise<void> {
  if (!data) return;
  await fs.mkdir(path.dirname(DB_FILE), { recursive: true });
  const tmp = `${DB_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.rename(tmp, DB_FILE);
}

/** Debounced persistence: mutations are batched across a short window. */
export function schedulePersist(): void {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    void persist().catch(() => {
      // best-effort persistence for the demo store
    });
  }, 120);
}

export async function flush(): Promise<void> {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  await persist();
}

export const uploadsDir = path.join(DATA_DIR, "uploads");

export async function ensureUploadsDir(): Promise<void> {
  await fs.mkdir(uploadsDir, { recursive: true });
}

export function sessionExpiry(): string {
  return new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
}

export function passwordResetExpiry(): string {
  return new Date(Date.now() + 60 * 60 * 1000).toISOString();
}