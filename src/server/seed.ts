import { getData, hashPassword, persist, uid, nowISO, type UserRecord } from "./db";

export const SEED_ACCOUNTS = [
  { email: "demo@tikjap.dev", password: "demo1234", name: "Demo User", role: "user" as const },
  { email: "admin@tikjap.dev", password: "admin1234", name: "Admin", role: "admin" as const },
];

export async function seedIfEmpty(): Promise<void> {
  const store = await getData();
  if (store.users.length > 0) return;

  for (const account of SEED_ACCOUNTS) {
    const { hash, salt } = await hashPassword(account.password);
    const user: UserRecord = {
      id: uid(),
      email: account.email.toLowerCase().trim(),
      name: account.name,
      role: account.role,
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
  }
  await persist();
}