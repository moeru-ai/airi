CREATE TABLE "outbox_events" (
\t"id" text PRIMARY KEY NOT NULL,
\t"event_id" text NOT NULL,
\t"event_type" text NOT NULL,
\t"aggregate_id" text NOT NULL,
\t"user_id" text NOT NULL,
\t"request_id" text,
\t"schema_version" integer NOT NULL,
\t"payload" text NOT NULL,
\t"occurred_at" timestamp NOT NULL,
\t"available_at" timestamp DEFAULT now() NOT NULL,
\t"claimed_by" text,
\t"claim_expires_at" timestamp,
\t"published_at" timestamp,
\t"stream_message_id" text,
\t"created_at" timestamp DEFAULT now() NOT NULL,
\t"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "outbox_events_event_id_idx" ON "outbox_events" USING btree ("event_id");
--> statement-breakpoint
CREATE INDEX "outbox_events_publish_scan_idx" ON "outbox_events" USING btree ("published_at","available_at","claim_expires_at","created_at");
--> statement-breakpoint
CREATE INDEX "outbox_events_claimed_by_idx" ON "outbox_events" USING btree ("claimed_by");
