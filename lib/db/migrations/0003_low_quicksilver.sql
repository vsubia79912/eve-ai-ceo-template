CREATE TABLE "user_model_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"ceo_model_id" text DEFAULT 'openai/gpt-5.4-mini' NOT NULL,
	"engineering_model_id" text DEFAULT 'openai/gpt-5.4-mini' NOT NULL,
	"reviewer_model_id" text DEFAULT 'openai/gpt-5.4-mini' NOT NULL,
	"codex_model_id" text DEFAULT 'openai/gpt-5.4' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "model_id" text DEFAULT 'openai/gpt-5.4-mini' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat" ADD COLUMN "next_event_index" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task" ADD COLUMN "effective_models" jsonb;--> statement-breakpoint
UPDATE "chat" SET "model_id" = 'openai/gpt-5.4';--> statement-breakpoint
UPDATE "chat" SET "next_event_index" = (
	SELECT count(*)::integer FROM "chat_event" WHERE "chat_event"."chat_id" = "chat"."id"
);--> statement-breakpoint
ALTER TABLE "user_model_settings" ADD CONSTRAINT "user_model_settings_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
