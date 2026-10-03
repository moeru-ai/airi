ALTER TABLE "user_flux" ADD COLUMN "unsettled_micro_flux" bigint DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "user_flux" ADD CONSTRAINT "user_flux_unsettled_nonnegative" CHECK ("unsettled_micro_flux" >= 0);
--> statement-breakpoint
ALTER TABLE "llm_request_settlement" RENAME TO "flux_usage";
--> statement-breakpoint
ALTER TABLE "flux_usage" ADD COLUMN "service" text DEFAULT 'llm' NOT NULL;
--> statement-breakpoint
ALTER TABLE "flux_usage" ALTER COLUMN "service" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "flux_usage" ADD COLUMN "turn_id" text;
--> statement-breakpoint
ALTER TABLE "flux_usage" ADD COLUMN "cost_micro_flux" bigint;
--> statement-breakpoint
ALTER TABLE "flux_usage" ADD COLUMN "precision" text DEFAULT 'micro_flux' NOT NULL;
--> statement-breakpoint
ALTER TABLE "flux_usage" RENAME COLUMN "requested_flux" TO "requested_debit_flux";
--> statement-breakpoint
ALTER TABLE "flux_usage" RENAME COLUMN "charged_flux" TO "wallet_debit_flux";
--> statement-breakpoint
UPDATE "flux_usage" SET "precision" = 'whole_flux', "cost_micro_flux" = "requested_debit_flux" * 1000000 WHERE "billing_status" = 'settled';
--> statement-breakpoint
ALTER TABLE "flux_usage" ADD CONSTRAINT "flux_usage_cost_nonnegative" CHECK ("cost_micro_flux" >= 0);
--> statement-breakpoint
DROP INDEX "llm_settlement_user_request_uidx";
--> statement-breakpoint
DROP INDEX "llm_settlement_status_created_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "flux_usage_user_service_request_uidx" ON "flux_usage" ("user_id", "service", "request_id");
--> statement-breakpoint
CREATE INDEX "flux_usage_status_created_idx" ON "flux_usage" ("billing_status", "created_at");
--> statement-breakpoint
ALTER TABLE "flux_transaction" RENAME COLUMN "settlement_id" TO "usage_id";
--> statement-breakpoint
ALTER INDEX "flux_tx_settlement_idx" RENAME TO "flux_tx_usage_idx";
