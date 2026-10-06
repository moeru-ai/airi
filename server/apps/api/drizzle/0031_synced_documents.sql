CREATE TABLE "synced_document_fields" (
	"owner_id" text NOT NULL,
	"collection" text NOT NULL,
	"document_id" text NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"revision" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "synced_document_fields_owner_id_collection_document_id_key_pk" PRIMARY KEY("owner_id","collection","document_id","key")
);
--> statement-breakpoint
CREATE TABLE "synced_documents" (
	"owner_id" text NOT NULL,
	"collection" text NOT NULL,
	"document_id" text NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "synced_documents_owner_id_collection_document_id_pk" PRIMARY KEY("owner_id","collection","document_id")
);
--> statement-breakpoint
ALTER TABLE "synced_document_fields" ADD CONSTRAINT "synced_document_fields_document_fk" FOREIGN KEY ("owner_id","collection","document_id") REFERENCES "public"."synced_documents"("owner_id","collection","document_id") ON DELETE cascade ON UPDATE no action;