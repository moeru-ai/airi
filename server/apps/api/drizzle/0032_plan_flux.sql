ALTER TABLE "user_flux" ADD COLUMN "plan_flux" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "plan_quota" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "plan_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "plan_period_start" timestamp;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "plan_filled_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "plan_reset_at" timestamp;--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "fallback_to_flux" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "flux_transaction" ADD COLUMN "pool" text DEFAULT 'wallet' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_flux" ADD CONSTRAINT "user_flux_plan_nonnegative" CHECK ("user_flux"."plan_flux" >= 0 AND "user_flux"."plan_quota" >= 0);