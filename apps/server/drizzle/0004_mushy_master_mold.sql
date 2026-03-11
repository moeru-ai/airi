ALTER TABLE "llm_request_log" ADD COLUMN "prompt_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "completion_tokens" integer;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "settled" boolean DEFAULT false NOT NULL;
CREATE INDEX idx_unsettled ON llm_request_log (settled, created_at) WHERE settled = false;