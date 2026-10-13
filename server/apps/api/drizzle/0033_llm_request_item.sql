CREATE TABLE "llm_request_item" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"session_id" text,
	"interaction_id" text,
	"direction" text NOT NULL,
	"position" integer NOT NULL,
	"role" text NOT NULL,
	"part_type" text NOT NULL,
	"text" text,
	"tool_name" text,
	"tool_call_id" text,
	"arguments" jsonb,
	"attributes" jsonb,
	"truncated" boolean DEFAULT false NOT NULL,
	"parser_version" integer NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "llm_request_item_request_position_uidx" ON "llm_request_item" USING btree ("user_id","request_id","direction","position");--> statement-breakpoint
CREATE INDEX "llm_request_item_user_created_idx" ON "llm_request_item" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "llm_request_item_interaction_idx" ON "llm_request_item" USING btree ("interaction_id");--> statement-breakpoint
CREATE INDEX "llm_request_item_tool_call_created_idx" ON "llm_request_item" USING btree ("created_at") WHERE part_type = 'tool_call';