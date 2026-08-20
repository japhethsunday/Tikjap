import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  getData,
  persist,
  schedulePersist,
  uid,
  nowISO,
  hashPassword,
  verifyPassword,
  sha256,
  randomToken,
  passwordResetExpiry,
} from "./db";
import {
  HttpError,
  json,
  publicUser,
  requireUser,
  getSessionUser,
  createSessionRecord,
  setSessionCookie,
  clearSessionCookie,
  touchUserActivity,
} from "./http";
import { seedIfEmpty } from "./seed";
import { isDemoMode } from "@/lib/env";
import { SESSION_COOKIE } from "@/lib/constants";
import type { LoginInput, SignupInput } from "@/lib/types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function handleSignup(request: Request): Promise<NextResponse> {
  await seedIfEmpty();
  const store = await getData();
  const body = (await request.json().catch(() => null)) as Partial<SignupInput> | null;
  const name = body?.name?.trim() ?? "";
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  if (name.length < 2) throw new HttpError(400, "validation", "Please enter a name.", { name: "Name must be at least 2 characters." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "validation", "Enter a valid email address.", { email: "Enter a valid email address." });
  if (password.length < 8) throw new HttpError(400, "validation", "Password must be at least 8 characters.", { password: "Password must be at least 8 characters." });

  const existing = store.users.find((u) => u.email === email);
  if (existing) {
    throw new HttpError(409, "conflict", "An account with this email already exists.", { email: "An account with this email already exists." });
  }

  const { hash, salt } = await hashPassword(password);
  const user = {
    id: uid(),
    email,
    name,
    role: "user" as const,
    passwordHash: hash,
    passwordSalt: salt,
    createdAt: nowISO(),
    lastActiveAt: nowISO(),
  };
  store.users.push(user);
  store.preferences.push({
    userId: user.id,
    defaultModelId: null,
    temperature: 0.7,
    markdown: true,
    showTimestamps: true,
    streamingEnabled: true,
  });
  await persist();

  const { session, rawToken } = createSessionRecord(user.id);
  store.sessions.push(session);
  await persist();

  const response = json({ user: publicUser(user) }, { status: 201 });
  setSessionCookie(response, rawToken, session.expiresAt);
  return response;
}

export async function handleLogin(request: Request): Promise<NextResponse> {
  await seedIfEmpty();
  const store = await getData();
  const body = (await request.json().catch(() => null)) as Partial<LoginInput> | null;
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  const user = store.users.find((u) => u.email === email);
  if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
    throw new HttpError(401, "unauthorized", "Invalid email or password.");
  }

  user.lastActiveAt = nowISO();
  const { session, rawToken } = createSessionRecord(user.id, {
    userAgent: request.headers.get("user-agent") ?? undefined,
    ip: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
  });
  store.sessions.push(session);
  await persist();

  const response = json({ user: publicUser(user) });
  setSessionCookie(response, rawToken, session.expiresAt);
  return response;
}

export async function handleLogout(): Promise<NextResponse> {
  const store = await getData();
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const tokenHash = sha256(token);
    store.sessions = store.sessions.filter((s) => s.tokenHash !== tokenHash);
    schedulePersist();
  }
  const response = json({ ok: true });
  clearSessionCookie(response);
  return response;
}

export async function handleSession(): Promise<NextResponse> {
  const sessionUser = await getSessionUser();
  if (sessionUser) {
    await touchUserActivity(sessionUser.user.id);
    return json({ user: publicUser(sessionUser.user) });
  }
  return json({ user: null });
}

export async function handleListSessions(): Promise<NextResponse> {
  const { user, session: current } = await requireUser();
  const store = await getData();
  const sessions = store.sessions
    .filter((s) => s.userId === user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((s) => ({
      id: s.tokenHash,
      current: s.tokenHash === current.tokenHash,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      userAgent: s.userAgent,
      ip: s.ip,
    }));
  return json({ sessions });
}

export async function handleLogoutOthers(): Promise<NextResponse> {
  const { user, session: current } = await requireUser();
  const store = await getData();
  store.sessions = store.sessions.filter((s) => s.userId !== user.id || s.tokenHash === current.tokenHash);
  await persist();
  return json({ ok: true });
}

export async function handleForgotPassword(request: Request): Promise<NextResponse> {
  const store = await getData();
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const user = store.users.find((u) => u.email === email);
  let demoResetToken: string | undefined;
  if (user) {
    const token = randomToken();
    store.resets.push({
      tokenHash: sha256(token),
      userId: user.id,
      createdAt: nowISO(),
      expiresAt: passwordResetExpiry(),
      used: false,
    });
    await persist();
    if (isDemoMode) demoResetToken = token;
  }
  // Always report success to avoid leaking which emails exist.
  return json({ sent: true, ...(demoResetToken ? { demoResetToken } : {}) });
}

export async function handleResetPassword(request: Request): Promise<NextResponse> {
  const store = await getData();
  const body = (await request.json().catch(() => null)) as { token?: string; password?: string } | null;
  const token = body?.token ?? "";
  const password = body?.password ?? "";
  if (password.length < 8) {
    throw new HttpError(400, "validation", "Password must be at least 8 characters.");
  }
  const reset = store.resets.find((r) => r.tokenHash === sha256(token) && !r.used);
  if (!reset || new Date(reset.expiresAt).getTime() < Date.now()) {
    throw new HttpError(400, "validation", "This reset link is invalid or has expired.");
  }
  const user = store.users.find((u) => u.id === reset.userId);
  if (!user) {
    throw new HttpError(400, "validation", "This reset link is invalid or has expired.");
  }
  reset.used = true;
  const { hash, salt } = await hashPassword(password);
  user.passwordHash = hash;
  user.passwordSalt = salt;
  // Invalidate all existing sessions after a password reset.
  store.sessions = store.sessions.filter((s) => s.userId !== user.id);
  await persist();
  return json({ ok: true });
}

export async function handleChangePassword(request: Request): Promise<NextResponse> {
  const { user, session: current } = await requireUser();
  const store = await getData();
  const body = (await request.json().catch(() => null)) as { currentPassword?: string; newPassword?: string } | null;
  const currentPassword = body?.currentPassword ?? "";
  const newPassword = body?.newPassword ?? "";
  if (!(await verifyPassword(currentPassword, user.passwordSalt, user.passwordHash))) {
    throw new HttpError(400, "validation", "Your current password is incorrect.", { currentPassword: "Your current password is incorrect." });
  }
  if (newPassword.length < 8) {
    throw new HttpError(400, "validation", "New password must be at least 8 characters.", { newPassword: "New password must be at least 8 characters." });
  }
  const { hash, salt } = await hashPassword(newPassword);
  user.passwordHash = hash;
  user.passwordSalt = salt;
  store.sessions = store.sessions.filter((s) => s.userId !== user.id || s.tokenHash === current.tokenHash);
  await persist();
  return json({ ok: true });
}