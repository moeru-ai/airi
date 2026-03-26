CREATE TABLE "flux_ledger" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"amount" integer NOT NULL,
	"balance_before" integer NOT NULL,
	"balance_after" integer NOT NULL,
	"request_id" text,
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"event_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text,
	"schema_version" integer NOT NULL,
	"payload" text NOT NULL,
	"occurred_at" timestamp NOT NULL,
	"available_at" timestamp DEFAULT now() NOT NULL,
	"claimed_by" text,
	"claim_expires_at" timestamp,
	"published_at" timestamp,
	"stream_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_request_log" DROP CONSTRAINT "llm_request_log_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "messages" ALTER COLUMN "sender_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "stripe_checkout_session" ADD COLUMN "flux_credited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stripe_invoice" ADD COLUMN "flux_credited" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "flux_ledger" ADD CONSTRAINT "flux_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "flux_ledger_user_id_idx" ON "flux_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "flux_ledger_created_at_idx" ON "flux_ledger" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "flux_ledger_user_request_uniq" ON "flux_ledger" USING btree ("user_id","request_id") WHERE request_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_id_idx" ON "outbox_events" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "outbox_events_publish_scan_idx" ON "outbox_events" USING btree ("published_at","available_at","claim_expires_at","created_at");--> statement-breakpoint
CREATE INDEX "outbox_events_claimed_by_idx" ON "outbox_events" USING btree ("claimed_by");--> statement-breakpoint
ALTER TABLE "llm_request_log" DROP COLUMN "settled";