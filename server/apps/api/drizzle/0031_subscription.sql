CREATE TABLE "revenuecat_event" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"type" text NOT NULL,
	"app_user_id" text,
	"product_id" text,
	"entitlement_ids" text[] NOT NULL,
	"payload" jsonb NOT NULL,
	"received_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_allowance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp,
	"granted_credit" integer NOT NULL,
	"used_credit" integer DEFAULT 0 NOT NULL,
	"unsettled_micro_credit" bigint DEFAULT 0 NOT NULL,
	"event_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_consumption" (
	"request_id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"allowance_id" text NOT NULL,
	"micro_credit" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_billing_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"fallback_to_flux" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "revenuecat_event_event_id_uidx" ON "revenuecat_event" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "revenuecat_event_app_user_id_idx" ON "revenuecat_event" USING btree ("app_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_allowance_event_uidx" ON "subscription_allowance" USING btree ("event_id") WHERE event_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "subscription_allowance_user_id_idx" ON "subscription_allowance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_consumption_user_id_idx" ON "subscription_consumption" USING btree ("user_id");