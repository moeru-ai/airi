ALTER TABLE "provider_catalog_tts_models" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "provider_catalog_tts_models" ADD COLUMN "cost_multiplier" real DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_packs" DROP COLUMN "cost_multiplier";