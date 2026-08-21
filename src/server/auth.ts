import { NextResponse } from "next/server";
import { createServerClient, createServiceClient } from "./supabase";
import { HttpError } from "./errors";
import { json, publicUser, requireUser, touchUserActivity, getSessionUser } from "./http";
import { deleteAuthSessionsExcept, ensureProfile, getServerUser, iso, listAuthSessions } from "./store";
import { seedIfEmpty } from "./seed";
import { EMAIL_PATTERN } from "@/lib/validation";
import type { LoginInput, SignupInput } from "@/lib/types";

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function displayNameFrom(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string {
  const meta = user.user_metadata?.name;
  if (typeof meta === "string" && meta.trim()) return meta.trim();
  return user.email?.split("@")[0] ?? "User";
}

export async function handleSignup(request: Request): Promise<NextResponse> {
  await seedIfEmpty();
  const body = (await request.json().catch(() => null)) as Partial<SignupInput> | null;
  const name = body?.name?.trim() ?? "";
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  if (name.length < 2) {
    throw new HttpError(400, "validation", "Please enter a name.", { name: "Name must be at least 2 characters." });
  }
  if (!EMAIL_PATTERN.test(email)) {
    throw new HttpError(400, "validation", "Enter a valid email address.", { email: "Enter a valid email address." });
  }
  if (password.length < 8) {
    throw new HttpError(400, "validation", "Password must be at least 8 characters.", { password: "Password must be at least 8 characters." });
  }

  // Provision the account via the admin API so registration never depends on the
  // shared confirmation-email quota (which rate-limits signups on the free tier).
  // The user is created pre-confirmed, then signed in immediately below.
  const admin = createServiceClient();
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name },
  });
  if (createError) {
    if (/already|exists|duplicate|registered/i.test(createError.message)) {
      throw new HttpError(409, "conflict", "An account with this email already exists.", {
        email: "An account with this email already exists.",
      });
    }
    if (/rate\s*limit/i.test(createError.message)) {
      throw new HttpError(429, "rate_limit", "Too many attempts right now. Please wait a minute and try again.");
    }
    console.error("[auth/signup]", createError.message);
    throw new HttpError(500, "internal", "Could not create your account. Please try again.");
  }
  if (!created.user) {
    throw new HttpError(500, "internal", "Could not create your account. Please try again.");
  }

  const supabase = await createServerClient();
  const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError || !signIn.user) {
    // Account exists but session could not be established — treat like a fresh login.
    throw new HttpError(401, "unauthorized", "Your account was created. Please sign in.", undefined);
  }

  const user = await getServerUser(signIn.user.id, signIn.user.email ?? email);
  if (!user) {
    await ensureProfile(signIn.user.id, displayNameFrom(signIn.user));
    const retry = await getServerUser(signIn.user.id, signIn.user.email ?? email);
    if (!retry) throw new HttpError(500, "internal", "Could not load your account.");
    await touchUserActivity(retry.id);
    return json({ user: publicUser(retry) }, { status: 201 });
  }
  await touchUserActivity(user.id).catch(() => undefined);
  return json({ user: publicUser(user) }, { status: 201 });
}

export async function handleLogin(request: Request): Promise<NextResponse> {
  await seedIfEmpty();
  const body = (await request.json().catch(() => null)) as Partial<LoginInput> | null;
  const email = normalizeEmail(body?.email ?? "");
  const password = body?.password ?? "";

  const supabase = await createServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    if (/not confirmed/i.test(error?.message ?? "")) {
      throw new HttpError(403, "forbidden", "Please confirm your email address before signing in.");
    }
    throw new HttpError(401, "unauthorized", "Invalid email or password.");
  }

  let user = await getServerUser(data.user.id, data.user.email ?? email);
  if (!user) {
    await ensureProfile(data.user.id, displayNameFrom(data.user));
    user = await getServerUser(data.user.id, data.user.email ?? email);
    if (!user) throw new HttpError(500, "internal", "Could not load your account.");
  }
  await touchUserActivity(user.id);
  return json({ user: publicUser(user) });
}

export async function handleLogout(): Promise<NextResponse> {
  const supabase = await createServerClient();
  await supabase.auth.signOut().catch(() => undefined);
  return json({ ok: true });
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
  const rows = await listAuthSessions(user.id);
  const sessions = rows.map((session) => ({
    id: session.id,
    current: Boolean(current.sid && session.id === current.sid),
    createdAt: iso(session.created_at),
    expiresAt: iso(session.not_after),
    userAgent: session.user_agent ?? undefined,
    ip: session.ip ?? undefined,
  }));
  return json({ sessions });
}

export async function handleLogoutOthers(): Promise<NextResponse> {
  const { user, session: current } = await requireUser();
  if (current.sid) {
    await deleteAuthSessionsExcept(user.id, current.sid);
  }
  return json({ ok: true });
}

export async function handleForgotPassword(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { email?: string } | null;
  const email = normalizeEmail(body?.email ?? "");
  const supabase = await createServerClient();
  const origin = new URL(request.url).origin;
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
  if (error) {
    console.error("[auth/forgot-password]", error.message);
  }
  // Always report success to avoid leaking which emails exist.
  return json({ sent: true });
}

export async function handleResetPassword(request: Request): Promise<NextResponse> {
  const body = (await request.json().catch(() => null)) as { code?: string; password?: string } | null;
  const code = body?.code ?? "";
  const password = body?.password ?? "";
  if (password.length < 8) {
    throw new HttpError(400, "validation", "Password must be at least 8 characters.");
  }
  if (!code) {
    throw new HttpError(400, "validation", "This reset link is invalid or has expired.");
  }
  const supabase = await createServerClient();
  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    throw new HttpError(400, "validation", "This reset link is invalid or has expired.");
  }
  const { error: updateError } = await supabase.auth.updateUser({ password });
  // Sign out so the user logs in fresh with the new password.
  await supabase.auth.signOut().catch(() => undefined);
  if (updateError) {
    throw new HttpError(400, "validation", "Could not update your password. Please try again.");
  }
  return json({ ok: true });
}

export async function handleChangePassword(request: Request): Promise<NextResponse> {
  const { user } = await requireUser();
  const body = (await request.json().catch(() => null)) as { currentPassword?: string; newPassword?: string } | null;
  const currentPassword = body?.currentPassword ?? "";
  const newPassword = body?.newPassword ?? "";
  if (newPassword.length < 8) {
    throw new HttpError(400, "validation", "New password must be at least 8 characters.", { newPassword: "New password must be at least 8 characters." });
  }
  const supabase = await createServerClient();
  const { error: verifyError } = await supabase.auth.signInWithPassword({ email: user.email, password: currentPassword });
  if (verifyError) {
    throw new HttpError(400, "validation", "Your current password is incorrect.", { currentPassword: "Your current password is incorrect." });
  }
  const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
  if (updateError) {
    throw new HttpError(400, "validation", "Could not update your password. Please try again.");
  }
  return json({ ok: true });
}