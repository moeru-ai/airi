ALTER TABLE "characters" DROP CONSTRAINT "characters_creator_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "characters" DROP CONSTRAINT "characters_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "flux_transaction" DROP CONSTRAINT "flux_transaction_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_flux" DROP CONSTRAINT "user_flux_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_provider_configs" DROP CONSTRAINT "user_provider_configs_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_checkout_session" DROP CONSTRAINT "stripe_checkout_session_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_customer" DROP CONSTRAINT "stripe_customer_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_invoice" DROP CONSTRAINT "stripe_invoice_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "stripe_subscription" DROP CONSTRAINT "stripe_subscription_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_character_bookmarks" DROP CONSTRAINT "user_character_bookmarks_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_character_likes" DROP CONSTRAINT "user_character_likes_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_checkout_session" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_customer" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_invoice" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "stripe_subscription" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_character_bookmarks" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_character_likes" ADD COLUMN "deleted_at" timestamp;