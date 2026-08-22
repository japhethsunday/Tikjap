import { NextResponse } from "next/server";
import { createServerClient } from "./supabase";
import { HttpError } from "./errors";
import { ensureProfile, getServerUser, touchProfileActivity, type ServerUser } from "./store";
import type { ApiErrorCode } from "@/lib/api/errors";

export function json<T>(payload: T, init: { status?: number; headers?: Record<string, string>; response?: NextResponse } = {}): NextResponse {
  const { response } = init as { response?: NextResponse; status?: number; headers?: Record<string, string> };
  const { status, headers, ...restInit } = init;
  const res = NextResponse.json(payload, { status, headers });
  if (response) {
    for (const cookie of response.cookies.getAll()) {
      res.cookies.set(cookie.name, cookie.value, cookie);
    }
  }
  return res;
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
  user: ServerUser;
  session: { sid?: string };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.getUser();
  const authUser = data.user;
  if (error || !authUser) return null;

  let user = await getServerUser(authUser.id, authUser.email ?? "");
  if (!user) {
    const name =
      typeof authUser.user_metadata?.name === "string" && authUser.user_metadata.name.trim()
        ? authUser.user_metadata.name.trim()
        : (authUser.email?.split("@")[0] ?? "User");
    await ensureProfile(authUser.id, name);
    user = await getServerUser(authUser.id, authUser.email ?? "");
  }
  if (!user) return null;

  let sid: string | undefined;
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (token) {
      const payload = JSON.parse(Buffer.from(token.split(".")[1] ?? "", "base64url").toString("utf8"));
      sid = payload.sid;
    }
  } catch {
    // Session id is only used to identify the current device.
  }

  return { user, session: { sid } };
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

export function publicUser(user: ServerUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    plan: user.plan,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}

export async function touchUserActivity(userId: string): Promise<void> {
  await touchProfileActivity(userId).catch(() => undefined);
}