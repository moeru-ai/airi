ALTER TABLE "llm_request_attempt" ADD COLUMN "error_body" jsonb;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "prompt" jsonb;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "completion" jsonb;--> statement-breakpoint
ALTER TABLE "llm_request_log" ADD COLUMN "error_body" jsonb;