CREATE TABLE "character_covers" (
	"id" text PRIMARY KEY NOT NULL,
	"character_id" text NOT NULL,
	"foreground_url" text NOT NULL,
	"background_url" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "system_provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"definition_id" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"validated" boolean DEFAULT false NOT NULL,
	"validation_bypassed" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "user_settings_provider_configs" RENAME TO "user_provider_configs";--> statement-breakpoint
ALTER TABLE "character_bookmarks" RENAME TO "user_character_bookmarks";--> statement-breakpoint
ALTER TABLE "character_likes" RENAME TO "user_character_likes";--> statement-breakpoint
ALTER TABLE "user_character_bookmarks" DROP CONSTRAINT "character_bookmarks_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_character_bookmarks" DROP CONSTRAINT "character_bookmarks_character_id_characters_id_fk";
--> statement-breakpoint
ALTER TABLE "user_character_likes" DROP CONSTRAINT "character_likes_user_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_character_likes" DROP CONSTRAINT "character_likes_character_id_characters_id_fk";
--> statement-breakpoint
ALTER TABLE "user_provider_configs" DROP CONSTRAINT "user_settings_provider_configs_owner_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "user_character_bookmarks" DROP CONSTRAINT "character_bookmarks_user_id_character_id_pk";--> statement-breakpoint
ALTER TABLE "user_character_likes" DROP CONSTRAINT "character_likes_user_id_character_id_pk";--> statement-breakpoint
ALTER TABLE "user_character_bookmarks" ADD CONSTRAINT "user_character_bookmarks_user_id_character_id_pk" PRIMARY KEY("user_id","character_id");--> statement-breakpoint
ALTER TABLE "user_character_likes" ADD CONSTRAINT "user_character_likes_user_id_character_id_pk" PRIMARY KEY("user_id","character_id");--> statement-breakpoint
ALTER TABLE "character_covers" ADD CONSTRAINT "character_covers_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_character_bookmarks" ADD CONSTRAINT "user_character_bookmarks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_character_bookmarks" ADD CONSTRAINT "user_character_bookmarks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_character_likes" ADD CONSTRAINT "user_character_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_character_likes" ADD CONSTRAINT "user_character_likes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_provider_configs" ADD CONSTRAINT "user_provider_configs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "characters" DROP COLUMN "character_avatar_url";--> statement-breakpoint
ALTER TABLE "characters" DROP COLUMN "cover_background_url";