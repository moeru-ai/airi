CREATE TABLE "payment_order" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_order_id" text,
	"status" text NOT NULL,
	"amount" integer,
	"currency" text,
	"pack_key" text,
	"flux_amount" bigint,
	"subscription_id" text,
	"credited_at" timestamp,
	"provider_data" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "provider_account" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"provider_customer_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "payment_order_provider_order_uidx" ON "payment_order" USING btree ("provider","provider_order_id") WHERE provider_order_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payment_order_user_id_idx" ON "payment_order" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_account_provider_customer_uidx" ON "provider_account" USING btree ("provider","provider_customer_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "provider_account_user_id_idx" ON "provider_account" USING btree ("user_id");--> statement-breakpoint
INSERT INTO "provider_account" ("id", "user_id", "provider", "provider_customer_id", "created_at", "updated_at", "deleted_at")
SELECT "id", "user_id", 'stripe', "stripe_customer_id", "created_at", "updated_at", "deleted_at"
FROM "stripe_customer";--> statement-breakpoint
ALTER TABLE "user_flux" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
DROP TABLE "stripe_checkout_session" CASCADE;--> statement-breakpoint
DROP TABLE "stripe_invoice" CASCADE;--> statement-breakpoint
DROP TABLE "stripe_subscription" CASCADE;--> statement-breakpoint
DROP TABLE "stripe_customer" CASCADE;
