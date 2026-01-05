ALTER TABLE "avatar_model" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "characters" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
ALTER TABLE "character_i18n" ADD COLUMN "deleted_at" timestamp;