CREATE TABLE "subscription_allowance" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"entitlement_id" text NOT NULL,
	"period_start" timestamp NOT NULL,
	"period_end" timestamp,
	"granted_credit" integer NOT NULL,
	"used_credit" integer DEFAULT 0 NOT NULL,
	"unsettled_micro_credit" bigint DEFAULT 0 NOT NULL,
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
CREATE UNIQUE INDEX "subscription_allowance_period_uidx" ON "subscription_allowance" USING btree ("user_id","entitlement_id","period_start");--> statement-breakpoint
CREATE INDEX "subscription_consumption_user_id_idx" ON "subscription_consumption" USING btree ("user_id");