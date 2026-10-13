CREATE TABLE "agent_run" (
	"user_id" text NOT NULL,
	"interaction_id" text NOT NULL,
	"session_id" text,
	"trace_id" text,
	"status" text NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"llm_calls" integer NOT NULL,
	"tool_calls" integer NOT NULL,
	"server_tool_calls" integer NOT NULL,
	"failed_tools" integer NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"has_client_trace" boolean NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "agent_run_user_id_interaction_id_pk" PRIMARY KEY("user_id","interaction_id")
);
--> statement-breakpoint
CREATE TABLE "agent_trace_span" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"span_id" text NOT NULL,
	"parent_span_id" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"interaction_id" text,
	"session_id" text,
	"request_id" text,
	"tool_name" text,
	"tool_call_id" text,
	"status" text NOT NULL,
	"error_type" text,
	"started_at" timestamp NOT NULL,
	"duration_ms" integer,
	"attributes" jsonb,
	"app_surface" text,
	"app_version" text,
	"received_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE INDEX "agent_run_started_idx" ON "agent_run" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "agent_run_user_started_idx" ON "agent_run" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "agent_run_tool_calls_started_idx" ON "agent_run" USING btree ("tool_calls","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_trace_span_user_trace_span_uidx" ON "agent_trace_span" USING btree ("user_id","trace_id","span_id");--> statement-breakpoint
CREATE INDEX "agent_trace_span_user_interaction_idx" ON "agent_trace_span" USING btree ("user_id","interaction_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "llm_request_log_user_interaction_idx" ON "llm_request_log" USING btree ("user_id","interaction_id");