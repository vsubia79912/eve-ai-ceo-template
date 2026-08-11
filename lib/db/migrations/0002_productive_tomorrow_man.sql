CREATE TYPE "public"."task_status" AS ENUM('BACKLOG', 'ASSIGNED', 'RUNNING', 'BLOCKED_AWAITING_CEO', 'BLOCKED_AWAITING_OWNER', 'VERIFYING', 'REVIEWING', 'COMPLETED', 'FAILED', 'CANCELLED');--> statement-breakpoint
CREATE TABLE "approval" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"request" text NOT NULL,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"response" text,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "decision" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text,
	"task_id" text,
	"question" text NOT NULL,
	"decision" text NOT NULL,
	"reasoning" text NOT NULL,
	"decided_by" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"repository" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"parent_task_id" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"acceptance_criteria" jsonb NOT NULL,
	"status" "task_status" DEFAULT 'BACKLOG' NOT NULL,
	"priority" integer DEFAULT 3 NOT NULL,
	"assigned_agent" text DEFAULT 'engineering' NOT NULL,
	"repository" text NOT NULL,
	"base_branch" text DEFAULT 'main' NOT NULL,
	"working_branch" text,
	"eve_session_id" text,
	"engineering_agent_id" text,
	"sandbox_id" text,
	"coding_run_id" text,
	"current_stage" text DEFAULT 'created' NOT NULL,
	"blocking_question" jsonb,
	"verification" jsonb,
	"review" jsonb,
	"result" jsonb,
	"error" text,
	"pr_url" text,
	"pr_number" integer,
	"repair_attempts" integer DEFAULT 0 NOT NULL,
	"review_attempts" integer DEFAULT 0 NOT NULL,
	"codex_followups" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "task_event" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"type" text NOT NULL,
	"summary" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "approval" ADD CONSTRAINT "approval_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decision" ADD CONSTRAINT "decision_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_event" ADD CONSTRAINT "task_event_task_id_task_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."task"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_approval_task_status" ON "approval" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "idx_decision_project_created" ON "decision" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_decision_task_created" ON "decision" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_project_owner" ON "project" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_task_project_updated" ON "task" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_task_status_updated" ON "task" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_task_event_task_created" ON "task_event" USING btree ("task_id","created_at");