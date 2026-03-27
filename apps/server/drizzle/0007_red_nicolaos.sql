CREATE TABLE "flux_transaction" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"balance_before" bigint NOT NULL,
	"balance_after" bigint NOT NULL,
	"request_id" text,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "flux_ledger" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "flux_ledger" CASCADE;--> statement-breakpoint
ALTER TABLE "user_flux" ALTER COLUMN "flux" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "llm_request_log" ALTER COLUMN "flux_consumed" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD CONSTRAINT "flux_transaction_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flux_tx_user_id_idx" ON "flux_transaction" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "flux_tx_created_at_idx" ON "flux_transaction" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flux_tx_user_request_uniq" ON "flux_transaction" USING btree ("user_id","request_id") WHERE request_id IS NOT NULL;