import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { requireUser, readJson, publicUser } from "@/server/http";
import { getData, persist, type UserRecord } from "@/server/db";
import { HttpError } from "@/server/http";

export async function GET() {
  return withHandler(async () => {
    const { user } = await requireUser();
    return { user: publicUser(user) };
  });
}

export async function PATCH(request: NextRequest) {
  return withHandler(async () => {
    const { user } = await requireUser();
    const body = await readJson<{ name?: string; email?: string }>(request);
    const store = await getData();
    const target: UserRecord = store.users.find((u) => u.id === user.id) as UserRecord;
    if (!target) throw new HttpError(404, "not_found", "User not found.");

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2) throw new HttpError(400, "validation", "Name must be at least 2 characters.", { name: "Name must be at least 2 characters." });
      target.name = name;
    }
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new HttpError(400, "validation", "Enter a valid email address.", { email: "Enter a valid email address." });
      const existing = store.users.find((u) => u.email === email && u.id !== user.id);
      if (existing) throw new HttpError(409, "conflict", "An account with this email already exists.", { email: "An account with this email already exists." });
      target.email = email;
    }
    await persist();
    return { user: publicUser(target) };
  });
}

export const dynamic = "force-dynamic";