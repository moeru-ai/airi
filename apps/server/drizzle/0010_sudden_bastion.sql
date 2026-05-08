CREATE TABLE "flux_grant_batch" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text NOT NULL,
	"amount" bigint NOT NULL,
	"description" text,
	"status" text NOT NULL,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "flux_grant_batch_recipient" (
	"id" text PRIMARY KEY NOT NULL,
	"batch_id" text NOT NULL,
	"input_email" text NOT NULL,
	"user_id" text,
	"status" text NOT NULL,
	"error_reason" text,
	"flux_transaction_id" text,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_attempted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "flux_grant_batch_status_idx" ON "flux_grant_batch" USING btree ("status");--> statement-breakpoint
CREATE INDEX "flux_grant_batch_created_by_idx" ON "flux_grant_batch" USING btree ("created_by_user_id");--> statement-breakpoint
CREATE INDEX "flux_grant_batch_recipient_batch_status_idx" ON "flux_grant_batch_recipient" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "flux_grant_batch_recipient_pending_idx" ON "flux_grant_batch_recipient" USING btree ("status","last_attempted_at") WHERE status = 'pending';--> statement-breakpoint
CREATE UNIQUE INDEX "flux_grant_batch_recipient_batch_email_uniq" ON "flux_grant_batch_recipient" USING btree ("batch_id","input_email");