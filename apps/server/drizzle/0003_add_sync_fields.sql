-- Add sync fields to chats table
ALTER TABLE "chats" ADD COLUMN "max_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "last_message_at" timestamp;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "last_message_preview" text;--> statement-breakpoint

-- Add sync fields to chat_members table
ALTER TABLE "chat_members" ADD COLUMN "role" text DEFAULT 'member' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_members" ADD COLUMN "joined_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_members" ADD COLUMN "last_read_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint

-- Add sync fields to messages table
ALTER TABLE "messages" ADD COLUMN "seq" integer;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "parent_id" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "edited_at" timestamp;--> statement-breakpoint

-- Backfill seq for existing messages using row_number within each chat
UPDATE "messages" SET "seq" = sub.rn FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY chat_id ORDER BY created_at ASC) AS rn
  FROM "messages"
) AS sub WHERE "messages".id = sub.id;--> statement-breakpoint

-- Update max_seq for existing chats
UPDATE "chats" SET "max_seq" = COALESCE(sub.max_seq, 0) FROM (
  SELECT chat_id, MAX(seq) AS max_seq FROM "messages" GROUP BY chat_id
) AS sub WHERE "chats".id = sub.chat_id;--> statement-breakpoint

-- Now make seq NOT NULL
ALTER TABLE "messages" ALTER COLUMN "seq" SET NOT NULL;--> statement-breakpoint

-- Add constraints and indexes
ALTER TABLE "messages" ADD CONSTRAINT "messages_chat_id_seq_unique" UNIQUE("chat_id", "seq");--> statement-breakpoint
CREATE INDEX "messages_parent_id_idx" ON "messages" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "messages_chat_id_seq_idx" ON "messages" USING btree ("chat_id", "seq");
