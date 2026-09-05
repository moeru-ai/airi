ALTER TABLE "user_flux" DROP COLUMN "stripe_customer_id";--> statement-breakpoint
DROP TABLE "stripe_checkout_session" CASCADE;--> statement-breakpoint
DROP TABLE "stripe_invoice" CASCADE;--> statement-breakpoint
DROP TABLE "stripe_subscription" CASCADE;--> statement-breakpoint
DROP TABLE "stripe_customer" CASCADE;
