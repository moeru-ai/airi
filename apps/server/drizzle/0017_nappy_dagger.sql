CREATE TABLE "capability_alias_routes" (
	"id" text PRIMARY KEY NOT NULL,
	"alias_id" text NOT NULL,
	"router_model_id" text NOT NULL,
	"pool" text DEFAULT 'primary' NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"weight" integer DEFAULT 1 NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "capability_aliases" (
	"id" text PRIMARY KEY NOT NULL,
	"surface" text NOT NULL,
	"alias_id" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"fallback_enabled" boolean DEFAULT true NOT NULL,
	"load_balancing_enabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_catalog_tts_models" (
	"id" text PRIMARY KEY NOT NULL,
	"router_model_id" text NOT NULL,
	"provider" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_catalog_tts_voices" (
	"id" text PRIMARY KEY NOT NULL,
	"tts_model_id" text NOT NULL,
	"provider_voice_id" text NOT NULL,
	"display_name" text NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"display_order" integer DEFAULT 0 NOT NULL,
	"languages" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"labels" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"preview_audio_url" text,
	"source" text DEFAULT 'provider-sync' NOT NULL,
	"last_synced_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "capability_alias_routes" ADD CONSTRAINT "capability_alias_routes_alias_id_capability_aliases_id_fk" FOREIGN KEY ("alias_id") REFERENCES "public"."capability_aliases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "provider_catalog_tts_voices" ADD CONSTRAINT "provider_catalog_tts_voices_tts_model_id_provider_catalog_tts_models_id_fk" FOREIGN KEY ("tts_model_id") REFERENCES "public"."provider_catalog_tts_models"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capability_alias_routes_alias_model_pool_uidx" ON "capability_alias_routes" USING btree ("alias_id","router_model_id","pool");--> statement-breakpoint
CREATE UNIQUE INDEX "capability_aliases_surface_alias_uidx" ON "capability_aliases" USING btree ("surface","alias_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_catalog_tts_models_router_model_uidx" ON "provider_catalog_tts_models" USING btree ("router_model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_catalog_tts_voices_model_voice_uidx" ON "provider_catalog_tts_voices" USING btree ("tts_model_id","provider_voice_id");