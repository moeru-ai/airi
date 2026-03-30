ALTER TABLE "characters"
ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;
--> statement-breakpoint
ALTER TABLE "characters"
ADD COLUMN "nsfw_enabled" boolean DEFAULT false NOT NULL;
--> statement-breakpoint
ALTER TABLE "characters"
ADD COLUMN "nsfw_level" text DEFAULT 'none' NOT NULL;
--> statement-breakpoint
ALTER TABLE "characters"
ADD COLUMN "relationship_mode" text DEFAULT 'companion' NOT NULL;
--> statement-breakpoint
ALTER TABLE "characters"
ADD COLUMN "persona_profile" jsonb DEFAULT '{}'::jsonb NOT NULL;
