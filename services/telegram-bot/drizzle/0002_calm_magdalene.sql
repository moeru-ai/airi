ALTER TABLE "chat_messages" ADD COLUMN "platform_message_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD COLUMN "reply_to_id" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "joined_chats" ADD CONSTRAINT "joined_chats_chat_id_unique" UNIQUE("chat_id");