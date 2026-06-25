import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1).optional(),
  SESSION_SECRET: z.string().min(16),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  DISABLE_SYNC_WORKER: z
    .union([z.literal("0"), z.literal("1")])
    .optional()
    .transform((value) => value === "1"),
  TRUST_PROXY: z
    .union([z.literal("0"), z.literal("1")])
    .optional()
    .transform((value) => value === undefined ? undefined : value === "1"),
  COOKIE_SECURE: z
    .union([z.literal("0"), z.literal("1")])
    .optional()
    .transform((value) => value === undefined ? undefined : value === "1"),
  PGHOST: z.string().min(1).optional(),
  PGPORT: z.coerce.number().int().positive().optional(),
  PGDATABASE: z.string().min(1).optional(),
  PGUSER: z.string().min(1).optional(),
  PGPASSWORD: z.string().min(1).optional(),
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  const env = envSchema.parse(process.env);
  const hasDatabaseUrl = Boolean(env.DATABASE_URL);
  const hasPgParts = Boolean(env.PGHOST && env.PGDATABASE && env.PGUSER && env.PGPASSWORD);

  if (!hasDatabaseUrl && !hasPgParts) {
    throw new Error(
      "DATABASE_URL is required, or PGHOST/PGDATABASE/PGUSER/PGPASSWORD must all be set",
    );
  }

  return env;
}
