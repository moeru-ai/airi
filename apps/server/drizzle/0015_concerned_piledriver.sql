CREATE TABLE "voice_packs" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"voice_id" text NOT NULL,
	"tts_model_id" text NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cost_multiplier" real DEFAULT 1 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
