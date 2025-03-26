DROP EXTENSION IF EXISTS vectors;
CREATE EXTENSION vectors;

CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"from_id" text DEFAULT '' NOT NULL,
	"from_name" text DEFAULT '' NOT NULL,
	"in_chat_id" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"is_reply" boolean DEFAULT false NOT NULL,
	"reply_to_name" text DEFAULT '' NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"content_vector_1536" vector(1536),
	"content_vector_768" vector(768)
);
--> statement-breakpoint
CREATE TABLE "joined_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"chat_id" text DEFAULT '' UNIQUE NOT NULL,
	"chat_name" text DEFAULT '' NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"file_id" text DEFAULT '' NOT NULL,
	"image_base64" text DEFAULT '' NOT NULL,
	"image_path" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"description_vector_1536" vector(1536),
	"description_vector_768" vector(768)
);
--> statement-breakpoint
CREATE TABLE "stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"file_id" text DEFAULT '' NOT NULL,
	"image_base64" text DEFAULT '' NOT NULL,
	"image_path" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"description_vector_1536" vector(1536),
	"description_vector_768" vector(768)
);
--> statement-breakpoint
CREATE INDEX "chat_messages_content_vector_1536_index" ON "chat_messages" USING hnsw ("content_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chat_messages_content_vector_768_index" ON "chat_messages" USING hnsw ("content_vector_768" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "photos_description_vector_1536_index" ON "photos" USING hnsw ("description_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "photos_description_vector_768_index" ON "photos" USING hnsw ("description_vector_768" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "stickers_description_vector_1536_index" ON "stickers" USING hnsw ("description_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "stickers_description_vector_768_index" ON "stickers" USING hnsw ("description_vector_768" vector_cosine_ops);
