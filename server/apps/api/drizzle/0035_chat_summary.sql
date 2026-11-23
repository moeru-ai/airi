ALTER TABLE "chats" ADD COLUMN "first_message_id" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "first_message_text" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "last_message_id" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "last_message_text" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "last_message_role" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "last_message_at" timestamp;--> statement-breakpoint
-- Fill the summary of existing chats from their messages in seq order. Pushes keep it current from here on.
UPDATE "chats" SET "first_message_id" = "first"."id", "first_message_text" = "first"."text"
FROM (
  SELECT DISTINCT ON ("chat_id") "chat_id", "id", left(btrim(regexp_replace("content", '\s+', ' ', 'g')), 200) AS "text"
  FROM "messages"
  WHERE "deleted_at" IS NULL AND "role" IN ('user', 'assistant') AND btrim(regexp_replace("content", '\s+', ' ', 'g')) <> ''
  ORDER BY "chat_id", "seq"
) AS "first"
WHERE "first"."chat_id" = "chats"."id";--> statement-breakpoint
UPDATE "chats" SET "last_message_id" = "last"."id", "last_message_text" = "last"."text", "last_message_role" = "last"."role", "last_message_at" = "last"."created_at"
FROM (
  SELECT DISTINCT ON ("chat_id") "chat_id", "id", "role", "created_at", left(btrim(regexp_replace("content", '\s+', ' ', 'g')), 200) AS "text"
  FROM "messages"
  WHERE "deleted_at" IS NULL AND "role" IN ('user', 'assistant') AND btrim(regexp_replace("content", '\s+', ' ', 'g')) <> ''
  ORDER BY "chat_id", "seq" DESC
) AS "last"
WHERE "last"."chat_id" = "chats"."id";
