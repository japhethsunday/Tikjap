import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";
import { getData, sha256, sessionExpiry, nowISO, type SessionRecord, type UserRecord } from "./db";
import type { ApiErrorCode } from "@/lib/api/errors";
import { SESSION_COOKIE } from "@/lib/constants";
import { isDemoMode } from "@/lib/env";

export class HttpError extends Error {
  readonly status: number;
  readonly code: ApiErrorCode;
  readonly details?: Record<string, string>;

  constructor(status: number, code: ApiErrorCode, message: string, details?: Record<string, string>) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json<T>(payload: T, init: { status?: number; headers?: Record<string, string> } = {}): NextResponse {
  return NextResponse.json(payload, init);
}

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: Record<string, string>
): NextResponse {
  return NextResponse.json({ error: { code, message, details } }, { status });
}

export async function readJson<T>(request: Request): Promise<T> {
  try {
    return (await request.json()) as T;
  } catch {
    throw new HttpError(400, "validation", "Invalid JSON body.");
  }
}

export interface SessionUser {
  user: UserRecord;
  session: SessionRecord;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await getData();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const tokenHash = sha256(token);
  const session = store.sessions.find((s) => s.tokenHash === tokenHash);
  if (!session) return null;
  if (new Date(session.expiresAt).getTime() < Date.now()) return null;
  const user = store.users.find((u) => u.id === session.userId);
  if (!user) return null;
  return { user, session };
}

export async function requireUser(): Promise<SessionUser> {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    throw new HttpError(401, "unauthorized", "You must be signed in to continue.");
  }
  return sessionUser;
}

export async function requireAdmin(): Promise<SessionUser> {
  const sessionUser = await requireUser();
  if (sessionUser.user.role !== "admin") {
    throw new HttpError(403, "forbidden", "Administrator access is required.");
  }
  return sessionUser;
}

export function createSessionRecord(userId: string, meta?: { userAgent?: string; ip?: string }): { session: SessionRecord; rawToken: string } {
  const rawToken = randomBytes(32).toString("hex");
  const session: SessionRecord = {
    tokenHash: sha256(rawToken),
    userId,
    createdAt: nowISO(),
    expiresAt: sessionExpiry(),
    userAgent: meta?.userAgent ?? undefined,
    ip: meta?.ip ?? undefined,
  };
  return { session, rawToken };
}

export function setSessionCookie(response: NextResponse, rawToken: string, expiresAt: string): void {
  // The cookie value carries the raw token; the store keeps only its hash.
  response.cookies.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !isDemoMode,
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !isDemoMode,
    path: "/",
    expires: new Date(0),
  });
}

export function publicUser(user: UserRecord) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

export async function touchUserActivity(userId: string): Promise<void> {
  const store = await getData();
  const user = store.users.find((u) => u.id === userId);
  if (user) {
    user.lastActiveAt = nowISO();
  }
}
