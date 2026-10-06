CREATE TABLE "subscription" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"product_id" text,
	"store" text,
	"environment" text,
	"status" text NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
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
CREATE UNIQUE INDEX "subscription_user_entitlement_uidx" ON "subscription" USING btree ("user_id","entitlement_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "subscription_user_id_idx" ON "subscription" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_allowance_event_uidx" ON "subscription_allowance" USING btree ("event_id") WHERE event_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "subscription_allowance_user_id_idx" ON "subscription_allowance" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "subscription_consumption_user_id_idx" ON "subscription_consumption" USING btree ("user_id");