DROP TABLE "system_provider_configs" CASCADE;--> statement-breakpoint
DROP TABLE "user_provider_configs" CASCADE;--> statement-breakpoint
CREATE TABLE "user_provider_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"config_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"config" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_configs_owner_config_uidx" ON "user_provider_configs" USING btree ("owner_id","config_id");
