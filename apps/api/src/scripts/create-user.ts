import { eq } from "drizzle-orm";

import { closePool, getDb, users } from "@rstracker/db";

import { hashPassword } from "../lib/auth.js";
import { normalizeUsername } from "../lib/normalize.js";

function getFlag(name: string) {
  const index = process.argv.findIndex((value) => value === name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const username = getFlag("--username");
  const password = getFlag("--password");

  if (!username || !password) {
    throw new Error("Usage: pnpm create:user --username <name> --password <password>");
  }

  const db = getDb();
  const normalizedUsername = normalizeUsername(username);
  const existing = await db.query.users.findFirst({
    where: eq(users.normalizedUsername, normalizedUsername),
  });

  if (existing) {
    throw new Error(`User ${username} already exists`);
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({
      username: username.trim(),
      normalizedUsername,
      passwordHash,
    })
    .returning();

  console.log(`Created user ${user.username} with id ${user.id}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
