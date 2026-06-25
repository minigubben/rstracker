import { drizzle } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";

import * as schema from "./schema.js";

let pool: Pool | null = null;

function getPoolConfig(): PoolConfig {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return { connectionString };
  }

  const host = process.env.PGHOST;
  const database = process.env.PGDATABASE;
  const user = process.env.PGUSER;
  const password = process.env.PGPASSWORD;
  const portValue = process.env.PGPORT;

  if (!host || !database || !user || !password) {
    throw new Error(
      "DATABASE_URL is required, or PGHOST/PGDATABASE/PGUSER/PGPASSWORD must all be set",
    );
  }

  const port = portValue ? Number.parseInt(portValue, 10) : 5432;
  if (Number.isNaN(port) || port <= 0) {
    throw new Error("PGPORT must be a positive integer");
  }

  return {
    host,
    port,
    database,
    user,
    password,
  };
}

export function getPool() {
  if (!pool) {
    pool = new Pool(getPoolConfig());
  }

  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

export async function closePool() {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
