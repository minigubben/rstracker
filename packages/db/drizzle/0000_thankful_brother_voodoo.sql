CREATE TABLE "characters" (
	"id" serial PRIMARY KEY NOT NULL,
	"display_name" text NOT NULL,
	"normalized_name" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"sync_status" text DEFAULT 'idle' NOT NULL,
	"last_successful_sync_at" timestamp with time zone,
	"last_attempted_sync_at" timestamp with time zone,
	"next_auto_refresh_at" timestamp with time zone,
	"pending_refresh" boolean DEFAULT false NOT NULL,
	"last_sync_error" text,
	"last_payload_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "characters_normalized_name_unique" UNIQUE("normalized_name")
);
--> statement-breakpoint
CREATE TABLE "session" (
	"sid" varchar(255) PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "snapshot_activities" (
	"snapshot_id" integer NOT NULL,
	"activity_id" integer NOT NULL,
	"activity_name" text NOT NULL,
	"rank" integer NOT NULL,
	"score" bigint NOT NULL,
	CONSTRAINT "snapshot_activities_snapshot_id_activity_id_pk" PRIMARY KEY("snapshot_id","activity_id")
);
--> statement-breakpoint
CREATE TABLE "snapshot_skills" (
	"snapshot_id" integer NOT NULL,
	"skill_id" integer NOT NULL,
	"skill_name" text NOT NULL,
	"rank" integer NOT NULL,
	"level" integer NOT NULL,
	"xp" bigint NOT NULL,
	CONSTRAINT "snapshot_skills_snapshot_id_skill_id_pk" PRIMARY KEY("snapshot_id","skill_id")
);
--> statement-breakpoint
CREATE TABLE "snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"sync_run_id" integer,
	"fetched_at" timestamp with time zone NOT NULL,
	"payload_json" jsonb NOT NULL,
	"payload_hash" text NOT NULL,
	"http_status" integer NOT NULL,
	"source_name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"character_id" integer NOT NULL,
	"trigger_type" text NOT NULL,
	"requested_by_user_id" integer,
	"status" text NOT NULL,
	"error_message" text,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_characters" (
	"user_id" integer NOT NULL,
	"character_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_characters_user_id_character_id_pk" PRIMARY KEY("user_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"normalized_username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_normalized_username_unique" UNIQUE("normalized_username")
);
--> statement-breakpoint
ALTER TABLE "snapshot_activities" ADD CONSTRAINT "snapshot_activities_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshot_skills" ADD CONSTRAINT "snapshot_skills_snapshot_id_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "snapshots" ADD CONSTRAINT "snapshots_sync_run_id_sync_runs_id_fk" FOREIGN KEY ("sync_run_id") REFERENCES "public"."sync_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_requested_by_user_id_users_id_fk" FOREIGN KEY ("requested_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_characters" ADD CONSTRAINT "user_characters_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_characters" ADD CONSTRAINT "user_characters_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "session_expire_idx" ON "session" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "snapshot_activities_activity_id_snapshot_id_idx" ON "snapshot_activities" USING btree ("activity_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "snapshot_skills_skill_id_snapshot_id_idx" ON "snapshot_skills" USING btree ("skill_id","snapshot_id");--> statement-breakpoint
CREATE INDEX "snapshots_character_id_fetched_at_idx" ON "snapshots" USING btree ("character_id","fetched_at");--> statement-breakpoint
CREATE INDEX "sync_runs_character_id_created_at_idx" ON "sync_runs" USING btree ("character_id","created_at");