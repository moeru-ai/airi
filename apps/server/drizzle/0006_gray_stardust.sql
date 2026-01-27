ALTER TABLE "chat_members" ALTER COLUMN "user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_members" ADD COLUMN "member_type" text NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_members" ADD COLUMN "character_id" text;--> statement-breakpoint
ALTER TABLE "chats" ADD COLUMN "title" text;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "role" text NOT NULL;--> statement-breakpoint
ALTER TABLE "chat_members" ADD CONSTRAINT "chat_members_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;