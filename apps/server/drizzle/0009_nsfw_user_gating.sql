ALTER TABLE "user"
  ADD COLUMN "adult_verified" boolean DEFAULT false NOT NULL;

ALTER TABLE "user"
  ADD COLUMN "allow_sensitive_content" boolean DEFAULT false NOT NULL;

ALTER TABLE "user"
  ADD COLUMN "content_tier" text DEFAULT 'standard' NOT NULL;
