CREATE TABLE "provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"definition_id" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validated" boolean DEFAULT false NOT NULL,
	"validation_bypassed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;