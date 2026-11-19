CREATE TABLE "character_cards_fields" (
	"owner_id" text NOT NULL,
	"document_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb,
	"revision" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_cards_fields_pk" PRIMARY KEY("owner_id","document_id","key","revision")
);
--> statement-breakpoint
CREATE TABLE "character_cards" (
	"owner_id" text NOT NULL,
	"document_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "character_cards_pk" PRIMARY KEY("owner_id","document_id")
);
--> statement-breakpoint
ALTER TABLE "character_cards_fields" ADD CONSTRAINT "character_cards_fields_document_fk" FOREIGN KEY ("owner_id","document_id") REFERENCES "public"."character_cards"("owner_id","document_id") ON DELETE cascade ON UPDATE no action;