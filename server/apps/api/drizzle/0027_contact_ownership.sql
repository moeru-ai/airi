CREATE TABLE "contacts" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"character_id" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "contacts_owner_character_unique" UNIQUE("owner_id","character_id"),
	CONSTRAINT "contacts_owner_id_unique" UNIQUE("owner_id","id")
);
--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "contact_id" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "contact_owner_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_contact_owner_fk" FOREIGN KEY ("contact_owner_id","contact_id") REFERENCES "public"."contacts"("owner_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chats_contact_owner_idx" ON "chats" USING btree ("contact_owner_id","contact_id");--> statement-breakpoint
ALTER TABLE "chats" ADD CONSTRAINT "chats_contact_binding_check" CHECK (("chats"."contact_id" IS NULL AND "chats"."contact_owner_id" IS NULL) OR ("chats"."contact_id" IS NOT NULL AND "chats"."contact_owner_id" IS NOT NULL AND "chats"."type" = 'bot'));
