CREATE TABLE "character_bookmarks" (
	"user_id" text NOT NULL,
	"character_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "character_likes" (
	"user_id" text NOT NULL,
	"character_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "character_avatar_url" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "cover_background_url" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "creator_role" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "price_credit" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "likes_count" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "bookmarks_count" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "interactions_count" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "forks_count" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "character_i18n" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "character_bookmarks" ADD CONSTRAINT "character_bookmarks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_bookmarks" ADD CONSTRAINT "character_bookmarks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_likes" ADD CONSTRAINT "character_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_likes" ADD CONSTRAINT "character_likes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;