import { relations } from "drizzle-orm";

import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  varchar,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  normalizedUsername: text("normalized_username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const characters = pgTable("characters", {
  id: serial("id").primaryKey(),
  displayName: text("display_name").notNull(),
  normalizedName: text("normalized_name").notNull().unique(),
  status: text("status").notNull().default("active"),
  syncStatus: text("sync_status").notNull().default("idle"),
  lastSuccessfulSyncAt: timestamp("last_successful_sync_at", { withTimezone: true }),
  lastAttemptedSyncAt: timestamp("last_attempted_sync_at", { withTimezone: true }),
  nextAutoRefreshAt: timestamp("next_auto_refresh_at", { withTimezone: true }),
  pendingRefresh: boolean("pending_refresh").notNull().default(false),
  lastSyncError: text("last_sync_error"),
  lastPayloadHash: text("last_payload_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const userCharacters = pgTable(
  "user_characters",
  {
    userId: integer("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    characterId: integer("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.characterId] })],
);

export const syncRuns = pgTable(
  "sync_runs",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    triggerType: text("trigger_type").notNull(),
    requestedByUserId: integer("requested_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    status: text("status").notNull(),
    errorMessage: text("error_message"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index("sync_runs_character_id_created_at_idx").on(table.characterId, table.createdAt),
  ],
);

export const snapshots = pgTable(
  "snapshots",
  {
    id: serial("id").primaryKey(),
    characterId: integer("character_id")
      .notNull()
      .references(() => characters.id, { onDelete: "cascade" }),
    syncRunId: integer("sync_run_id").references(() => syncRuns.id, { onDelete: "set null" }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull(),
    payloadJson: jsonb("payload_json").notNull(),
    payloadHash: text("payload_hash").notNull(),
    httpStatus: integer("http_status").notNull(),
    sourceName: text("source_name").notNull(),
  },
  (table) => [index("snapshots_character_id_fetched_at_idx").on(table.characterId, table.fetchedAt)],
);

export const snapshotSkills = pgTable(
  "snapshot_skills",
  {
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    skillId: integer("skill_id").notNull(),
    skillName: text("skill_name").notNull(),
    rank: integer("rank").notNull(),
    level: integer("level").notNull(),
    xp: bigint("xp", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.skillId] }),
    index("snapshot_skills_skill_id_snapshot_id_idx").on(table.skillId, table.snapshotId),
  ],
);

export const snapshotActivities = pgTable(
  "snapshot_activities",
  {
    snapshotId: integer("snapshot_id")
      .notNull()
      .references(() => snapshots.id, { onDelete: "cascade" }),
    activityId: integer("activity_id").notNull(),
    activityName: text("activity_name").notNull(),
    rank: integer("rank").notNull(),
    score: bigint("score", { mode: "number" }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.snapshotId, table.activityId] }),
    index("snapshot_activities_activity_id_snapshot_id_idx").on(
      table.activityId,
      table.snapshotId,
    ),
  ],
);

export const session = pgTable(
  "session",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { withTimezone: true }).notNull(),
  },
  (table) => [index("session_expire_idx").on(table.expire)],
);

export const usersRelations = relations(users, ({ many }) => ({
  trackedCharacters: many(userCharacters),
  syncRuns: many(syncRuns),
}));

export const charactersRelations = relations(characters, ({ many }) => ({
  subscribers: many(userCharacters),
  syncRuns: many(syncRuns),
  snapshots: many(snapshots),
}));

export const userCharactersRelations = relations(userCharacters, ({ one }) => ({
  user: one(users, {
    fields: [userCharacters.userId],
    references: [users.id],
  }),
  character: one(characters, {
    fields: [userCharacters.characterId],
    references: [characters.id],
  }),
}));

export const syncRunsRelations = relations(syncRuns, ({ one }) => ({
  character: one(characters, {
    fields: [syncRuns.characterId],
    references: [characters.id],
  }),
  requestedByUser: one(users, {
    fields: [syncRuns.requestedByUserId],
    references: [users.id],
  }),
}));

export const snapshotsRelations = relations(snapshots, ({ one, many }) => ({
  character: one(characters, {
    fields: [snapshots.characterId],
    references: [characters.id],
  }),
  syncRun: one(syncRuns, {
    fields: [snapshots.syncRunId],
    references: [syncRuns.id],
  }),
  skills: many(snapshotSkills),
  activities: many(snapshotActivities),
}));

export const snapshotSkillsRelations = relations(snapshotSkills, ({ one }) => ({
  snapshot: one(snapshots, {
    fields: [snapshotSkills.snapshotId],
    references: [snapshots.id],
  }),
}));

export const snapshotActivitiesRelations = relations(snapshotActivities, ({ one }) => ({
  snapshot: one(snapshots, {
    fields: [snapshotActivities.snapshotId],
    references: [snapshots.id],
  }),
}));
