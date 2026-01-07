CREATE TABLE "character_bookmarks" (
	"user_id" text NOT NULL,
	"character_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_bookmarks_user_id_character_id_pk" PRIMARY KEY("user_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "character_likes" (
	"user_id" text NOT NULL,
	"character_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "character_likes_user_id_character_id_pk" PRIMARY KEY("user_id","character_id")
);
--> statement-breakpoint
CREATE TABLE "provider_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
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
ALTER TABLE "characters" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "character_avatar_url" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "cover_background_url" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "creator_role" text;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "price_credit" text DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "likes_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "bookmarks_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "interactions_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "forks_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "character_i18n" ADD COLUMN "tagline" text;--> statement-breakpoint
ALTER TABLE "character_bookmarks" ADD CONSTRAINT "character_bookmarks_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_bookmarks" ADD CONSTRAINT "character_bookmarks_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_likes" ADD CONSTRAINT "character_likes_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "character_likes" ADD CONSTRAINT "character_likes_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_configs" ADD CONSTRAINT "provider_configs_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;