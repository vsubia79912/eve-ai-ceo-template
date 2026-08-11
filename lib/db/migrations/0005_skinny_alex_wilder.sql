CREATE TYPE "public"."merge_attempt_status" AS ENUM('REQUESTED', 'REVIEWING', 'CHECKS_PENDING', 'MERGING', 'MERGED', 'FAILED');--> statement-breakpoint
CREATE TABLE "merge_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"requested_by" text NOT NULL,
	"pr_number" integer NOT NULL,
	"pr_url" text NOT NULL,
	"status" "merge_attempt_status" DEFAULT 'REQUESTED' NOT NULL,
	"base_sha" text,
	"head_sha" text,
	"verification" jsonb,
	"review" jsonb,
	"error" text,
	"merge_commit_sha" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "merge_mode" text DEFAULT 'disabled' NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "merge_method" text DEFAULT 'squash' NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "published_base_sha" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "published_head_sha" text;--> statement-breakpoint
ALTER TABLE "merge_attempt" ADD CONSTRAINT "merge_attempt_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_merge_attempt_task_created" ON "merge_attempt" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_merge_attempt_status_updated" ON "merge_attempt" USING btree ("status","updated_at");