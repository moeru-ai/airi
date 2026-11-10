DROP TABLE "system_provider_configs" CASCADE;--> statement-breakpoint
DROP TABLE "user_provider_configs" CASCADE;--> statement-breakpoint
CREATE TABLE "user_provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"instance_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"config" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "user_provider_configs_owner_instance_uidx" ON "user_provider_configs" USING btree ("owner_id","instance_id");
