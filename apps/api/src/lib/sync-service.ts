import { and, asc, desc, eq, inArray, lte, sql } from "drizzle-orm";

import {
  characters,
  getDb,
  getPool,
  snapshotActivities,
  snapshotSkills,
  snapshots,
  syncRuns,
} from "@rstracker/db";

import { fetchHiscores, OsrsNotFoundError, type HiscorePayload } from "./osrs.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 60 * 60 * 1000;

type TriggerType = "initial_add" | "automatic" | "manual";

async function writeSnapshot({
  characterId,
  triggerType,
  payload,
  payloadHash,
  fetchedAt,
  httpStatus,
  requestedByUserId,
}: {
  characterId: number;
  triggerType: TriggerType;
  payload: HiscorePayload;
  payloadHash: string;
  fetchedAt: Date;
  httpStatus: number;
  requestedByUserId?: number | null;
}) {
  const db = getDb();

  return db.transaction(async (tx) => {
    const queuedManualRun =
      triggerType === "manual"
        ? await tx.query.syncRuns.findFirst({
            where: and(
              eq(syncRuns.characterId, characterId),
              eq(syncRuns.status, "queued"),
              eq(syncRuns.triggerType, "manual"),
            ),
            orderBy: [asc(syncRuns.createdAt)],
          })
        : null;

    const [run] = queuedManualRun
      ? await tx
          .update(syncRuns)
          .set({
            status: "syncing",
            startedAt: fetchedAt,
            errorMessage: null,
          })
          .where(eq(syncRuns.id, queuedManualRun.id))
          .returning()
      : await tx
          .insert(syncRuns)
          .values({
            characterId,
            triggerType,
            requestedByUserId: requestedByUserId ?? null,
            status: "syncing",
            startedAt: fetchedAt,
          })
          .returning();

    const [snapshot] = await tx
      .insert(snapshots)
      .values({
        characterId,
        syncRunId: run.id,
        fetchedAt,
        payloadJson: payload,
        payloadHash,
        httpStatus,
        sourceName: payload.name,
      })
      .returning();

    await tx.insert(snapshotSkills).values(
      payload.skills.map((skill) => ({
        snapshotId: snapshot.id,
        skillId: skill.id,
        skillName: skill.name,
        rank: skill.rank,
        level: skill.level,
        xp: skill.xp,
      })),
    );

    await tx.insert(snapshotActivities).values(
      payload.activities.map((activity) => ({
        snapshotId: snapshot.id,
        activityId: activity.id,
        activityName: activity.name,
        rank: activity.rank,
        score: activity.score,
      })),
    );

    await tx
      .update(syncRuns)
      .set({
        status: "succeeded",
        finishedAt: fetchedAt,
      })
      .where(eq(syncRuns.id, run.id));

    await tx
      .update(characters)
      .set({
        displayName: payload.name,
        status: "active",
        syncStatus: "idle",
        lastAttemptedSyncAt: fetchedAt,
        lastSuccessfulSyncAt: fetchedAt,
        nextAutoRefreshAt: new Date(fetchedAt.getTime() + ONE_DAY_MS),
        pendingRefresh: false,
        lastSyncError: null,
        lastPayloadHash: payloadHash,
        updatedAt: fetchedAt,
      })
      .where(eq(characters.id, characterId));

    return snapshot;
  });
}

export async function syncCharacterNow({
  characterId,
  displayName,
  triggerType,
  requestedByUserId,
}: {
  characterId: number;
  displayName: string;
  triggerType: TriggerType;
  requestedByUserId?: number | null;
}) {
  try {
    const result = await fetchHiscores(displayName);
    await writeSnapshot({
      characterId,
      triggerType,
      payload: result.payload,
      payloadHash: result.payloadHash,
      fetchedAt: result.fetchedAt,
      httpStatus: result.httpStatus,
      requestedByUserId,
    });
    return { status: "succeeded" as const };
  } catch (error) {
    const db = getDb();
    const now = new Date();

    if (error instanceof OsrsNotFoundError) {
      await db.transaction(async (tx) => {
        const queuedRun = await tx.query.syncRuns.findFirst({
          where: and(
            eq(syncRuns.characterId, characterId),
            eq(syncRuns.status, "queued"),
          ),
          orderBy: [asc(syncRuns.createdAt)],
        });

        const [run] = queuedRun
          ? await tx
              .update(syncRuns)
              .set({
                status: "not_found",
                errorMessage: error.message,
                startedAt: queuedRun.startedAt ?? now,
                finishedAt: now,
              })
              .where(eq(syncRuns.id, queuedRun.id))
              .returning()
          : await tx
              .insert(syncRuns)
              .values({
                characterId,
                triggerType,
                requestedByUserId: requestedByUserId ?? null,
                status: "not_found",
                errorMessage: error.message,
                startedAt: now,
                finishedAt: now,
              })
              .returning();

        await tx
          .update(characters)
          .set({
            status: "not_found",
            syncStatus: "failed",
            pendingRefresh: false,
            lastAttemptedSyncAt: now,
            lastSyncError: error.message,
            nextAutoRefreshAt: new Date(now.getTime() + RETRY_MS),
            updatedAt: now,
          })
          .where(eq(characters.id, characterId));

        return run;
      });

      return { status: "not_found" as const, message: error.message };
    }

    const errorMessage =
      error instanceof Error ? error.message : "Unknown sync failure";

    await db.transaction(async (tx) => {
      const queuedRun = await tx.query.syncRuns.findFirst({
        where: and(eq(syncRuns.characterId, characterId), eq(syncRuns.status, "queued")),
        orderBy: [asc(syncRuns.createdAt)],
      });

      if (queuedRun) {
        await tx
          .update(syncRuns)
          .set({
            status: "failed",
            errorMessage,
            startedAt: queuedRun.startedAt ?? now,
            finishedAt: now,
          })
          .where(eq(syncRuns.id, queuedRun.id));
      } else {
        await tx.insert(syncRuns).values({
          characterId,
          triggerType,
          requestedByUserId: requestedByUserId ?? null,
          status: "failed",
          errorMessage,
          startedAt: now,
          finishedAt: now,
        });
      }

      await tx
        .update(characters)
        .set({
          syncStatus: "failed",
          pendingRefresh: false,
          lastAttemptedSyncAt: now,
          lastSyncError: errorMessage,
          nextAutoRefreshAt: new Date(now.getTime() + RETRY_MS),
          updatedAt: now,
        })
        .where(eq(characters.id, characterId));
    });

    return { status: "failed" as const, message: errorMessage };
  }
}

export async function queueManualRefresh(characterId: number, requestedByUserId: number) {
  const db = getDb();
  const now = new Date();

  const existing = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });

  if (!existing) {
    throw new Error("Character not found");
  }

  if (existing.syncStatus === "pending" || existing.syncStatus === "syncing") {
    return existing;
  }

  await db.transaction(async (tx) => {
    await tx.insert(syncRuns).values({
      characterId,
      triggerType: "manual",
      requestedByUserId,
      status: "queued",
      createdAt: now,
    });

    await tx
      .update(characters)
      .set({
        syncStatus: "pending",
        pendingRefresh: true,
        updatedAt: now,
      })
      .where(eq(characters.id, characterId));
  });

  return db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });
}

export async function claimDueCharacters(limit = 5) {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query("begin");
    const { rows } = await client.query<{
      id: number;
      display_name: string;
      pending_refresh: boolean;
    }>(
      `
        select id, display_name, pending_refresh
        from characters
        where sync_status <> 'syncing'
          and (pending_refresh = true or next_auto_refresh_at <= now())
        order by pending_refresh desc, next_auto_refresh_at asc nulls first
        limit $1
        for update skip locked
      `,
      [limit],
    );

    const ids = rows.map((row) => row.id);
    if (ids.length === 0) {
      await client.query("commit");
      return [];
    }

    await client.query(
      `
        update characters
        set sync_status = 'syncing',
            last_attempted_sync_at = now(),
            updated_at = now()
        where id = any($1::int[])
      `,
      [ids],
    );
    await client.query("commit");

    return rows.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      triggerType: (row.pending_refresh ? "manual" : "automatic") as TriggerType,
    }));
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}

export async function runPendingSyncs() {
  const claimed = await claimDueCharacters();
  for (const item of claimed) {
    await syncCharacterNow({
      characterId: item.id,
      displayName: item.displayName,
      triggerType: item.triggerType,
    });
  }
}

export async function getCharacterSummaryForUser(userId: number) {
  const db = getDb();
  const tracked = await db.query.userCharacters.findMany({
    where: (table, { eq }) => eq(table.userId, userId),
    with: {
      character: true,
    },
  });

  const result = [];
  for (const trackedCharacter of tracked) {
    const latestSnapshot = await db.query.snapshots.findFirst({
      where: eq(snapshots.characterId, trackedCharacter.characterId),
      orderBy: [desc(snapshots.fetchedAt)],
    });

    const overall = latestSnapshot
      ? await db.query.snapshotSkills.findFirst({
          where: and(eq(snapshotSkills.snapshotId, latestSnapshot.id), eq(snapshotSkills.skillId, 0)),
        })
      : null;

    result.push({
      ...trackedCharacter.character,
      latestOverallLevel: overall?.level ?? null,
      latestOverallXp: overall?.xp ?? null,
    });
  }

  return result;
}

export async function getCharacterDetail(characterId: number) {
  const db = getDb();
  const character = await db.query.characters.findFirst({
    where: eq(characters.id, characterId),
  });

  if (!character) {
    return null;
  }

  const latestSnapshot = await db.query.snapshots.findFirst({
    where: eq(snapshots.characterId, characterId),
    orderBy: [desc(snapshots.fetchedAt)],
  });

  const [skills, activities, runs] = await Promise.all([
    latestSnapshot
      ? db.query.snapshotSkills.findMany({
          where: eq(snapshotSkills.snapshotId, latestSnapshot.id),
          orderBy: [asc(snapshotSkills.skillId)],
        })
      : [],
    latestSnapshot
      ? db.query.snapshotActivities.findMany({
          where: eq(snapshotActivities.snapshotId, latestSnapshot.id),
          orderBy: [asc(snapshotActivities.activityId)],
        })
      : [],
    db.query.syncRuns.findMany({
      where: eq(syncRuns.characterId, characterId),
      orderBy: [desc(syncRuns.createdAt)],
      limit: 20,
    }),
  ]);

  return {
    character,
    latestSnapshot,
    skills,
    activities,
    syncRuns: runs,
  };
}

export async function getTimeseries({
  characterId,
  kind,
  metricId,
}: {
  characterId: number;
  kind: "skill" | "activity";
  metricId: number;
}) {
  const db = getDb();

  if (kind === "skill") {
    const rows = await db
      .select({
        fetchedAt: snapshots.fetchedAt,
        rank: snapshotSkills.rank,
        level: snapshotSkills.level,
        xp: snapshotSkills.xp,
      })
      .from(snapshotSkills)
      .innerJoin(snapshots, eq(snapshotSkills.snapshotId, snapshots.id))
      .where(and(eq(snapshots.characterId, characterId), eq(snapshotSkills.skillId, metricId)))
      .orderBy(asc(snapshots.fetchedAt));

    return rows;
  }

  const rows = await db
    .select({
      fetchedAt: snapshots.fetchedAt,
      rank: snapshotActivities.rank,
      score: snapshotActivities.score,
    })
    .from(snapshotActivities)
    .innerJoin(snapshots, eq(snapshotActivities.snapshotId, snapshots.id))
    .where(and(eq(snapshots.characterId, characterId), eq(snapshotActivities.activityId, metricId)))
    .orderBy(asc(snapshots.fetchedAt));

  return rows;
}

export async function getMetricGridData(characterId: number) {
  const db = getDb();

  const [skillRows, activityRows] = await Promise.all([
    db
      .select({
        metricId: snapshotSkills.skillId,
        name: snapshotSkills.skillName,
        fetchedAt: snapshots.fetchedAt,
        rank: snapshotSkills.rank,
        level: snapshotSkills.level,
        xp: snapshotSkills.xp,
      })
      .from(snapshotSkills)
      .innerJoin(snapshots, eq(snapshotSkills.snapshotId, snapshots.id))
      .where(eq(snapshots.characterId, characterId))
      .orderBy(asc(snapshotSkills.skillId), asc(snapshots.fetchedAt)),
    db
      .select({
        metricId: snapshotActivities.activityId,
        name: snapshotActivities.activityName,
        fetchedAt: snapshots.fetchedAt,
        rank: snapshotActivities.rank,
        score: snapshotActivities.score,
      })
      .from(snapshotActivities)
      .innerJoin(snapshots, eq(snapshotActivities.snapshotId, snapshots.id))
      .where(eq(snapshots.characterId, characterId))
      .orderBy(asc(snapshotActivities.activityId), asc(snapshots.fetchedAt)),
  ]);

  const skills = new Map<
    number,
    {
      id: number;
      name: string;
      latestLevel: number;
      latestXp: number;
      latestRank: number;
      points: Array<{
        fetchedAt: Date;
        rank: number;
        level: number;
        xp: number;
      }>;
    }
  >();

  for (const row of skillRows) {
    const current =
      skills.get(row.metricId) ?? {
        id: row.metricId,
        name: row.name,
        latestLevel: row.level,
        latestXp: row.xp,
        latestRank: row.rank,
        points: [],
      };

    current.name = row.name;
    current.latestLevel = row.level;
    current.latestXp = row.xp;
    current.latestRank = row.rank;
    current.points.push({
      fetchedAt: row.fetchedAt,
      rank: row.rank,
      level: row.level,
      xp: row.xp,
    });
    skills.set(row.metricId, current);
  }

  const activities = new Map<
    number,
    {
      id: number;
      name: string;
      latestScore: number;
      latestRank: number;
      points: Array<{
        fetchedAt: Date;
        rank: number;
        score: number;
      }>;
    }
  >();

  for (const row of activityRows) {
    const current =
      activities.get(row.metricId) ?? {
        id: row.metricId,
        name: row.name,
        latestScore: row.score,
        latestRank: row.rank,
        points: [],
      };

    current.name = row.name;
    current.latestScore = row.score;
    current.latestRank = row.rank;
    current.points.push({
      fetchedAt: row.fetchedAt,
      rank: row.rank,
      score: row.score,
    });
    activities.set(row.metricId, current);
  }

  return {
    skills: [...skills.values()],
    activities: [...activities.values()],
  };
}
