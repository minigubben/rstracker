import path from "node:path";
import { fileURLToPath } from "node:url";

import { migrate } from "drizzle-orm/node-postgres/migrator";

import { closePool, getDb } from "./client.js";

async function main() {
  const migrationsFolder = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../drizzle",
  );

  await migrate(getDb(), {
    migrationsFolder,
  });
  await closePool();
}

main().catch(async (error) => {
  console.error(error);
  await closePool();
  process.exitCode = 1;
});
