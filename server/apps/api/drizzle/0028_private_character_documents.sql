CREATE TABLE "character_documents" (
	"character_id" text PRIMARY KEY NOT NULL,
	"document" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "is_private" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "local_character_id" text;--> statement-breakpoint
ALTER TABLE "contacts" ADD COLUMN "last_mutation_id" text;--> statement-breakpoint
ALTER TABLE "character_documents" ADD CONSTRAINT "character_documents_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_owner_local_character_unique" UNIQUE("owner_id","local_character_id");
