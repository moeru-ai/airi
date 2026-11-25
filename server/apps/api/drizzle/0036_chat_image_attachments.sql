CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"object_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size" integer NOT NULL,
	"sha256" text NOT NULL,
	"state" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "attachments_object_key_uidx" ON "attachments" USING btree ("object_key");--> statement-breakpoint
CREATE INDEX "attachments_owner_id_created_at_idx" ON "attachments" USING btree ("owner_id","created_at");