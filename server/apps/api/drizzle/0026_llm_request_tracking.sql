CREATE TABLE "llm_request_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"sequence" integer NOT NULL,
	"gateway" text NOT NULL,
	"route_id" text,
	"credential_id" text NOT NULL,
	"model" text NOT NULL,
	"upstream_provider" text,
	"response_model" text,
	"generation_id" text,
	"state" text NOT NULL,
	"status" integer,
	"error_code" text,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"time_to_first_token_ms" integer,
	"provider_usage" jsonb,
	"provider_metadata" jsonb,
	"schema_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "total_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "cached_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "cache_write_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "reasoning_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "request_id" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "session_id" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "protocol" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "stream" boolean;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "requested_model" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "gateway" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "upstream_model" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "upstream_provider" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "response_model" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "generation_id" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "finish_reason" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "native_finish_reason" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "response_status" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "time_to_first_token_ms" integer;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "routing" jsonb;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "provider_usage" jsonb;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "provider_metadata" jsonb;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "attempt_id" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "interaction_id" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "state" text;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "started_at" timestamp;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "ended_at" timestamp;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "dimensions" jsonb;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "schema_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "llm_attempt_request_sequence_uidx" ON "llm_request_attempt" USING btree ("user_id","request_id","sequence");--> statement-breakpoint
CREATE INDEX "llm_attempt_gateway_generation_idx" ON "llm_request_attempt" USING btree ("gateway","generation_id");--> statement-breakpoint
CREATE INDEX "llm_attempt_state_started_idx" ON "llm_request_attempt" USING btree ("state","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "llm_request_log_user_request_uidx" ON "llm_request_log" USING btree ("user_id","request_id") WHERE request_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "llm_request_log_state_started_idx" ON "llm_request_log" USING btree ("state","started_at");--> statement-breakpoint
CREATE INDEX "llm_request_log_gateway_generation_idx" ON "llm_request_log" USING btree ("gateway","generation_id");--> statement-breakpoint
CREATE INDEX "llm_request_log_user_created_idx" ON "llm_request_log" USING btree ("user_id","created_at");