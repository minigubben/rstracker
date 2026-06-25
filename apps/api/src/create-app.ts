import path from "node:path";
import { fileURLToPath } from "node:url";

import { and, desc, eq } from "drizzle-orm";
import connectPgSimple from "connect-pg-simple";
import express from "express";
import session from "express-session";
import { z } from "zod";

import {
  characters,
  getDb,
  getPool,
  snapshots,
  syncRuns,
  userCharacters,
  users,
} from "@rstracker/db";

import type { AppEnv } from "./env.js";
import { verifyPassword } from "./lib/auth.js";
import { normalizeCharacterName, normalizeUsername } from "./lib/normalize.js";
import { fetchHiscores, OsrsNotFoundError } from "./lib/osrs.js";
import {
  getCharacterDetail,
  getCharacterSummaryForUser,
  getTimeseries,
  queueManualRefresh,
  syncCharacterNow,
} from "./lib/sync-service.js";

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const createCharacterSchema = z.object({
  name: z.string().min(1).max(64),
});

const timeseriesQuerySchema = z.object({
  kind: z.enum(["skill", "activity"]),
  metricId: z.coerce.number().int().nonnegative(),
  valueField: z.string().min(1),
});

function requireUserId(request: express.Request) {
  if (!request.session.userId) {
    throw new Error("UNAUTHORIZED");
  }

  return request.session.userId;
}

async function ensureCharacterAccess(userId: number, characterId: number) {
  const db = getDb();
  const link = await db.query.userCharacters.findFirst({
    where: and(eq(userCharacters.userId, userId), eq(userCharacters.characterId, characterId)),
  });

  if (!link) {
    throw new Error("FORBIDDEN");
  }
}

export function createApp(env: AppEnv): express.Express {
  const app = express();
  const db = getDb();

  app.disable("x-powered-by");
  app.use(express.json());

  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgStore({
        pool: getPool(),
        tableName: "session",
        createTableIfMissing: false,
      }),
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        sameSite: "lax",
        secure: env.NODE_ENV === "production",
        maxAge: 30 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.get("/api/health", (_request, response) => {
    response.json({ ok: true });
  });

  app.post("/api/auth/login", async (request, response) => {
    const input = loginSchema.safeParse(request.body);
    if (!input.success) {
      return response.status(400).json({ error: "Invalid login payload" });
    }

    const normalizedUsername = normalizeUsername(input.data.username);
    const user = await db.query.users.findFirst({
      where: eq(users.normalizedUsername, normalizedUsername),
    });

    if (!user || !(await verifyPassword(input.data.password, user.passwordHash))) {
      return response.status(401).json({ error: "Invalid username or password" });
    }

    request.session.userId = user.id;
    request.session.username = user.username;

    return response.json({
      user: {
        id: user.id,
        username: user.username,
      },
    });
  });

  app.post("/api/auth/logout", async (request, response) => {
    await new Promise<void>((resolve, reject) => {
      request.session.destroy((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
    response.clearCookie("connect.sid");
    response.status(204).end();
  });

  app.get("/api/auth/me", async (request, response) => {
    if (!request.session.userId || !request.session.username) {
      return response.status(401).json({ error: "Not authenticated" });
    }

    return response.json({
      user: {
        id: request.session.userId,
        username: request.session.username,
      },
    });
  });

  app.get("/api/characters", async (request, response) => {
    try {
      const userId = requireUserId(request);
      const items = await getCharacterSummaryForUser(userId);
      response.json({ items });
    } catch (error) {
      response.status(401).json({ error: "Not authenticated" });
    }
  });

  app.post("/api/characters", async (request, response) => {
    try {
      const userId = requireUserId(request);
      const input = createCharacterSchema.safeParse(request.body);
      if (!input.success) {
        return response.status(400).json({ error: "Invalid character payload" });
      }

      const normalizedName = normalizeCharacterName(input.data.name);
      const existingLink = await db
        .select({
          characterId: userCharacters.characterId,
        })
        .from(userCharacters)
        .innerJoin(characters, eq(userCharacters.characterId, characters.id))
        .where(
          and(
            eq(userCharacters.userId, userId),
            eq(characters.normalizedName, normalizedName),
          ),
        );

      if (existingLink.length > 0) {
        return response.status(409).json({ error: "Character is already tracked" });
      }

      let hiscores;
      try {
        hiscores = await fetchHiscores(input.data.name.trim());
      } catch (error) {
        if (error instanceof OsrsNotFoundError) {
          return response.status(404).json({ error: error.message });
        }

        throw error;
      }

      const now = hiscores.fetchedAt;
      const [character] = await db
        .insert(characters)
        .values({
          displayName: hiscores.payload.name,
          normalizedName,
          status: "active",
          syncStatus: "idle",
          lastAttemptedSyncAt: now,
          lastSuccessfulSyncAt: now,
          nextAutoRefreshAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          pendingRefresh: false,
          lastSyncError: null,
          lastPayloadHash: hiscores.payloadHash,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: characters.normalizedName,
          set: {
            displayName: hiscores.payload.name,
            status: "active",
            updatedAt: now,
          },
        })
        .returning();

      await db
        .insert(userCharacters)
        .values({
          userId,
          characterId: character.id,
        })
        .onConflictDoNothing();

      await syncCharacterNow({
        characterId: character.id,
        displayName: hiscores.payload.name,
        triggerType: "initial_add",
        requestedByUserId: userId,
      });

      const detail = await getCharacterDetail(character.id);
      response.status(201).json(detail);
    } catch (error) {
      if (error instanceof Error && error.message === "UNAUTHORIZED") {
        return response.status(401).json({ error: "Not authenticated" });
      }

      console.error(error);
      response.status(500).json({ error: "Failed to add character" });
    }
  });

  app.delete("/api/characters/:characterId", async (request, response) => {
    try {
      const userId = requireUserId(request);
      const characterId = Number.parseInt(request.params.characterId, 10);
      if (Number.isNaN(characterId)) {
        return response.status(400).json({ error: "Invalid character id" });
      }

      await db
        .delete(userCharacters)
        .where(and(eq(userCharacters.userId, userId), eq(userCharacters.characterId, characterId)));

      response.status(204).end();
    } catch {
      response.status(401).json({ error: "Not authenticated" });
    }
  });

  app.post("/api/characters/:characterId/refresh", async (request, response) => {
    try {
      const userId = requireUserId(request);
      const characterId = Number.parseInt(request.params.characterId, 10);
      if (Number.isNaN(characterId)) {
        return response.status(400).json({ error: "Invalid character id" });
      }

      await ensureCharacterAccess(userId, characterId);
      const updated = await queueManualRefresh(characterId, userId);
      response.status(202).json({ item: updated });
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return response.status(404).json({ error: "Character not found" });
      }

      response.status(401).json({ error: "Not authenticated" });
    }
  });

  app.get("/api/characters/:characterId", async (request, response) => {
    try {
      const userId = requireUserId(request);
      const characterId = Number.parseInt(request.params.characterId, 10);
      if (Number.isNaN(characterId)) {
        return response.status(400).json({ error: "Invalid character id" });
      }

      await ensureCharacterAccess(userId, characterId);
      const detail = await getCharacterDetail(characterId);
      if (!detail) {
        return response.status(404).json({ error: "Character not found" });
      }

      response.json(detail);
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return response.status(404).json({ error: "Character not found" });
      }

      response.status(401).json({ error: "Not authenticated" });
    }
  });

  app.get("/api/characters/:characterId/metrics", async (request, response) => {
    try {
      const userId = requireUserId(request);
      const characterId = Number.parseInt(request.params.characterId, 10);
      if (Number.isNaN(characterId)) {
        return response.status(400).json({ error: "Invalid character id" });
      }

      await ensureCharacterAccess(userId, characterId);
      const detail = await getCharacterDetail(characterId);
      if (!detail) {
        return response.status(404).json({ error: "Character not found" });
      }

      response.json({
        skills: detail.skills.map((skill) => ({
          id: skill.skillId,
          name: skill.skillName,
        })),
        activities: detail.activities.map((activity) => ({
          id: activity.activityId,
          name: activity.activityName,
        })),
      });
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return response.status(404).json({ error: "Character not found" });
      }

      response.status(401).json({ error: "Not authenticated" });
    }
  });

  app.get("/api/characters/:characterId/timeseries", async (request, response) => {
    try {
      const userId = requireUserId(request);
      const characterId = Number.parseInt(request.params.characterId, 10);
      if (Number.isNaN(characterId)) {
        return response.status(400).json({ error: "Invalid character id" });
      }

      await ensureCharacterAccess(userId, characterId);
      const parsed = timeseriesQuerySchema.safeParse(request.query);
      if (!parsed.success) {
        return response.status(400).json({ error: "Invalid timeseries query" });
      }

      const rows = await getTimeseries({
        characterId,
        kind: parsed.data.kind,
        metricId: parsed.data.metricId,
      });

      response.json({
        valueField: parsed.data.valueField,
        points: rows,
      });
    } catch (error) {
      if (error instanceof Error && error.message === "FORBIDDEN") {
        return response.status(404).json({ error: "Character not found" });
      }

      response.status(401).json({ error: "Not authenticated" });
    }
  });

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const webDistDir = path.resolve(__dirname, "../../web/dist");
  app.use(express.static(webDistDir));

  app.get("*", (request, response, next) => {
    if (request.path.startsWith("/api/")) {
      return next();
    }

    response.sendFile(path.join(webDistDir, "index.html"), (error) => {
      if (error) {
        next();
      }
    });
  });

  return app;
}
