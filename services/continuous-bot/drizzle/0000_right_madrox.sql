CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"fromId" text DEFAULT '' NOT NULL,
	"fromName" text DEFAULT '' NOT NULL,
	"inChatId" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"isReply" boolean DEFAULT false NOT NULL,
	"replyToName" text DEFAULT '' NOT NULL,
	"createdAt" bigint DEFAULT 0 NOT NULL,
	"updatedAt" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "joined_chats" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"chatId" text DEFAULT '' NOT NULL,
	"chatName" text DEFAULT '' NOT NULL,
	"createdAt" bigint DEFAULT 0 NOT NULL,
	"updatedAt" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "photos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"fileId" text DEFAULT '' NOT NULL,
	"imageBase64" text DEFAULT '' NOT NULL,
	"imagePath" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"createdAt" bigint DEFAULT 0 NOT NULL,
	"updatedAt" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stickers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"fileId" text DEFAULT '' NOT NULL,
	"imageBase64" text DEFAULT '' NOT NULL,
	"imagePath" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"createdAt" bigint DEFAULT 0 NOT NULL,
	"updatedAt" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "platform_chat_id_unique_index" ON "joined_chats" USING btree ("platform","chatId");