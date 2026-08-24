DROP TABLE "flux_audit_log" CASCADE;--> statement-breakpoint
ALTER TABLE "flux_ledger" ADD COLUMN "metadata" jsonb;