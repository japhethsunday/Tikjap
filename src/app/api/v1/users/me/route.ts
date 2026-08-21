import { NextRequest } from "next/server";
import { withHandler } from "@/server/handler";
import { HttpError } from "@/server/errors";
import { publicUser, readJson, requireUser } from "@/server/http";
import { getProfileRow, getServerUser, updateProfileName, type ServerUser } from "@/server/store";
import { createServerClient } from "@/server/supabase";
import { EMAIL_PATTERN } from "@/lib/validation";

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
    const supabase = await createServerClient();

    let current = user;

    if (body.name !== undefined) {
      const name = body.name.trim();
      if (name.length < 2) {
        throw new HttpError(400, "validation", "Name must be at least 2 characters.", { name: "Name must be at least 2 characters." });
      }
      await updateProfileName(user.id, name);
      const row = await getProfileRow(user.id);
      if (row) current = { ...current, name: row.name };
    }

    let emailUpdatePending = false;
    if (body.email !== undefined) {
      const email = body.email.trim().toLowerCase();
      if (!EMAIL_PATTERN.test(email)) {
        throw new HttpError(400, "validation", "Enter a valid email address.", { email: "Enter a valid email address." });
      }
      if (email !== user.email) {
        const { error } = await supabase.auth.updateUser({ email });
        if (error) {
          if (/already registered|already exists/i.test(error.message)) {
            throw new HttpError(409, "conflict", "An account with this email already exists.", { email: "An account with this email already exists." });
          }
          throw new HttpError(500, "internal", "Could not update your email. Please try again.");
        }
        emailUpdatePending = true;
      }
    }

    const refreshed = await getServerUser(user.id, user.email);
    const result: ServerUser = refreshed ?? current;
    return { user: publicUser(result), emailUpdatePending };
  });
}

export const dynamic = "force-dynamic";