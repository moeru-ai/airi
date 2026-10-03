CREATE TABLE "speech_billing_receipt" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"model" text NOT NULL,
	"turn_id" text,
	"provider" text,
	"pricing" jsonb NOT NULL,
	"units" bigint,
	"status" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"posted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "llm_request_settlement" RENAME TO "llm_billing_receipt";--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "unsettled_micro_flux" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "source_type" text;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "source_id" text;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "amount_micro_flux" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "unsettled_before" bigint;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "unsettled_after" bigint;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "trigger_transaction_id" text;--> statement-breakpoint
ALTER TABLE "llm_billing_receipt" ADD COLUMN "cost_micro_flux" bigint;--> statement-breakpoint
ALTER TABLE "llm_billing_receipt" ADD COLUMN "precision" text DEFAULT 'micro_flux' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "speech_receipt_user_request_uidx" ON "speech_billing_receipt" USING btree ("user_id","request_id");--> statement-breakpoint
CREATE UNIQUE INDEX "flux_tx_accrual_source_uidx" ON "flux_transaction" USING btree ("user_id","source_type","source_id") WHERE type = 'accrual';--> statement-breakpoint
ALTER TABLE "user_flux" ADD CONSTRAINT "user_flux_unsettled_nonnegative" CHECK ("user_flux"."unsettled_micro_flux" >= 0);--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD CONSTRAINT "flux_tx_accrual_shape" CHECK (type != 'accrual' OR (amount = 0 AND balance_before = balance_after AND source_type IS NOT NULL AND source_id IS NOT NULL AND amount_micro_flux >= 0 AND unsettled_before IS NOT NULL AND unsettled_after IS NOT NULL AND unsettled_after = unsettled_before + amount_micro_flux));--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD CONSTRAINT "flux_tx_micro_nonnegative" CHECK (amount_micro_flux >= 0);
--> statement-breakpoint
UPDATE llm_billing_receipt SET precision = 'whole_flux', cost_micro_flux = requested_flux * 1000000, billing_status = 'posted' WHERE billing_status = 'settled';

CREATE INDEX "flux_tx_trigger_idx" ON "flux_transaction" USING btree ("trigger_transaction_id");
