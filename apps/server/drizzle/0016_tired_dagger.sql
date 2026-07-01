ALTER TABLE "voice_packs" ADD COLUMN "upstream_voice_id" text;
UPDATE "voice_packs" SET "upstream_voice_id" = "voice_id";
ALTER TABLE "voice_packs" ALTER COLUMN "upstream_voice_id" SET NOT NULL;
