CREATE TABLE "display_models" (
	"id" text NOT NULL,
	"owner_id" text NOT NULL,
	"format" text NOT NULL,
	"name" text NOT NULL,
	"original_filename" text NOT NULL,
	"byte_size" bigint NOT NULL,
	"sha256" text NOT NULL,
	"object_key" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "display_models_pk" PRIMARY KEY("owner_id","id")
);
--> statement-breakpoint
CREATE TABLE "upload_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"purpose" text NOT NULL,
	"subject_id" text NOT NULL,
	"request_id" text NOT NULL,
	"object_key" text NOT NULL,
	"content_type" text NOT NULL,
	"expected_size" bigint NOT NULL,
	"expected_sha256" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE UNIQUE INDEX "upload_sessions_owner_purpose_request_unique" ON "upload_sessions" USING btree ("owner_id","purpose","request_id");--> statement-breakpoint
CREATE INDEX "upload_sessions_owner_status_idx" ON "upload_sessions" USING btree ("owner_id","status");