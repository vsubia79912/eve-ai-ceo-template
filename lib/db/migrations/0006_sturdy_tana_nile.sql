ALTER TABLE "task" DROP CONSTRAINT "task_project_id_project_id_fk";
--> statement-breakpoint
ALTER TABLE "task" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "project_id" text;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "repository" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "instructions" text;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "chat_id" text;--> statement-breakpoint
ALTER TABLE "chat" ADD CONSTRAINT "chat_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_chat_id_chat_id_fk" FOREIGN KEY ("chat_id") REFERENCES "public"."chat"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task" ADD CONSTRAINT "task_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_chat_project_updated" ON "chat" USING btree ("project_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_task_chat_updated" ON "task" USING btree ("chat_id","updated_at");
--> statement-breakpoint
UPDATE "chat" AS c
SET
  "project_id" = t."project_id",
  "repository" = t."repository"
FROM "task" AS t
WHERE
  c."project_id" IS NULL
  AND t."eve_session_id" = c."eve_session"->>'sessionId';
--> statement-breakpoint
UPDATE "task" AS t
SET "chat_id" = c."id"
FROM "chat" AS c
WHERE
  t."chat_id" IS NULL
  AND t."eve_session_id" = c."eve_session"->>'sessionId';
