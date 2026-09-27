CREATE TABLE "llm_request_settlement" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"attempt_id" text,
	"model" text NOT NULL,
	"method" text NOT NULL,
	"billing_provider" text,
	"billing_status" text NOT NULL,
	"pending_reason" text,
	"generation_id" text,
	"pricing" jsonb,
	"evidence" jsonb,
	"provider_usage" jsonb,
	"cost_usd" text,
	"requested_flux" bigint,
	"flux_consumed" bigint,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"settled_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "settlement_id" text;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "operation_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "llm_settlement_user_request_uidx" ON "llm_request_settlement" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE INDEX "llm_settlement_status_created_idx" ON "llm_request_settlement" USING btree ("billing_status","created_at");--> statement-breakpoint
CREATE INDEX "flux_tx_settlement_idx" ON "flux_transaction" USING btree ("settlement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flux_tx_user_operation_uidx" ON "flux_transaction" USING btree ("user_id","operation_id") WHERE operation_id IS NOT NULL;