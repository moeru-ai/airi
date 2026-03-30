CREATE TABLE "image_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "character_id" text NOT NULL,
  "route" text NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "prompt" text NOT NULL,
  "negative_prompt" text NOT NULL,
  "scene_type" text,
  "tags" text[] DEFAULT '{}' NOT NULL,
  "params" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "result_media_id" text,
  "error_message" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE TABLE "gallery_items" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "character_id" text NOT NULL,
  "image_job_id" text,
  "media_id" text,
  "title" text,
  "prompt" text NOT NULL,
  "negative_prompt" text NOT NULL,
  "scene_type" text,
  "tags" text[] DEFAULT '{}' NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

ALTER TABLE "gallery_items"
  ADD CONSTRAINT "gallery_items_image_job_id_image_jobs_id_fk"
  FOREIGN KEY ("image_job_id") REFERENCES "public"."image_jobs"("id")
  ON DELETE set null ON UPDATE no action;
