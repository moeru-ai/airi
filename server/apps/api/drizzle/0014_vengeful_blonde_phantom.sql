CREATE TABLE "product_events" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"feature" text NOT NULL,
	"action" text NOT NULL,
	"status" text NOT NULL,
	"source" text,
	"model" text,
	"provider" text,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "product_events_feature_action_created_at_idx" ON "product_events" USING btree ("feature","action","created_at");--> statement-breakpoint
CREATE INDEX "product_events_user_id_created_at_idx" ON "product_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "product_events_created_at_idx" ON "product_events" USING btree ("created_at");