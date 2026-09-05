DROP TABLE "system_provider_configs" CASCADE;--> statement-breakpoint
DROP TABLE "user_provider_configs" CASCADE;--> statement-breakpoint
CREATE TABLE "user_provider_configs" (
	"id" text NOT NULL,
	"owner_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"config" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "user_provider_configs_owner_id_id_pk" PRIMARY KEY("owner_id","id")
);
