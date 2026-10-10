CREATE TABLE "flux_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"amount_micro_flux" bigint NOT NULL,
	"detail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "flux_usage_amount_nonnegative" CHECK ("flux_usage"."amount_micro_flux" >= 0)
);
--> statement-breakpoint
ALTER TABLE "user_flux" ADD COLUMN "unsettled_micro_flux" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "flux_usage_user_source_uidx" ON "flux_usage" USING btree ("user_id","source_type","source_id");--> statement-breakpoint
ALTER TABLE "user_flux" ADD CONSTRAINT "user_flux_unsettled_nonnegative" CHECK ("user_flux"."unsettled_micro_flux" >= 0);