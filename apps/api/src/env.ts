import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  DISABLE_SYNC_WORKER: z
    .union([z.literal("0"), z.literal("1")])
    .optional()
    .transform((value) => value === "1"),
  COOKIE_SECURE: z
    .union([z.literal("0"), z.literal("1")])
    .optional()
    .transform((value) => value === undefined ? undefined : value === "1"),
});

export type AppEnv = z.infer<typeof envSchema>;

export function getEnv(): AppEnv {
  return envSchema.parse(process.env);
}
