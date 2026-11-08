ALTER TABLE "user_flux" ADD COLUMN "capacitor_flux" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "capacitor_quota" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "capacitor_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "capacitor_period_start" timestamp;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "capacitor_filled_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "capacitor_reset_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "fallback_to_flux" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "pool" text DEFAULT 'wallet' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_flux" ADD CONSTRAINT "user_flux_capacitor_nonnegative" CHECK ("user_flux"."capacitor_flux" >= 0 AND "user_flux"."capacitor_quota" >= 0);