CREATE TABLE "chat_completions_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"prompt" text NOT NULL,
	"response" text NOT NULL,
	"task" text NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"platform" text DEFAULT '' NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"is_processed" boolean DEFAULT false NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"content_vector_1536" vector(1536),
	"content_vector_1024" vector(1024),
	"content_vector_768" vector(768)
);
--> statement-breakpoint
CREATE TABLE "memory_access_patterns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"access_type" text NOT NULL,
	"context" text,
	"duration_ms" integer,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_associations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_memory_id" uuid NOT NULL,
	"target_memory_id" uuid NOT NULL,
	"association_type" text NOT NULL,
	"strength" integer DEFAULT 5 NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_consolidated_memories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"summary_type" text NOT NULL,
	"source_fragment_ids" jsonb DEFAULT '[]' NOT NULL,
	"source_episode_ids" jsonb DEFAULT '[]' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_vector_1536" vector(1536),
	"content_vector_1024" vector(1024),
	"content_vector_768" vector(768),
	"created_at" bigint DEFAULT 0 NOT NULL,
	"last_accessed" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_consolidation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"event_type" text NOT NULL,
	"consolidation_score" integer,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_entities" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"entity_type" text NOT NULL,
	"description" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	CONSTRAINT "memory_entities_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "memory_entity_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"entity_id" uuid NOT NULL,
	"importance" integer DEFAULT 5 NOT NULL,
	"relationship_type" text DEFAULT 'mentioned' NOT NULL,
	"confidence" integer DEFAULT 5 NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_episodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"episode_type" text NOT NULL,
	"title" text NOT NULL,
	"start_time" bigint DEFAULT 0 NOT NULL,
	"end_time" bigint,
	"is_processed" boolean DEFAULT false NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_fragments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"memory_type" text NOT NULL,
	"category" text NOT NULL,
	"importance" integer DEFAULT 5 NOT NULL,
	"emotional_impact" integer DEFAULT 0 NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"last_accessed" bigint DEFAULT 0 NOT NULL,
	"access_count" integer DEFAULT 1 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"content_vector_1536" vector(1536),
	"content_vector_1024" vector(1024),
	"content_vector_768" vector(768),
	"deleted_at" bigint,
	"episode_id" uuid
);
--> statement-breakpoint
CREATE TABLE "memory_long_term_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"priority" integer DEFAULT 5 NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"deadline" bigint,
	"status" text DEFAULT 'planned' NOT NULL,
	"parent_goal_id" uuid,
	"category" text DEFAULT 'personal' NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "memory_search_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"query" text NOT NULL,
	"results_count" integer NOT NULL,
	"selected_memory_id" uuid,
	"search_duration_ms" integer,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_settings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mem_llm_provider" text DEFAULT 'openai' NOT NULL,
	"mem_llm_model" text DEFAULT 'gpt-3.5-turbo' NOT NULL,
	"mem_llm_api_key" text NOT NULL,
	"mem_llm_temperature" integer DEFAULT 7 NOT NULL,
	"mem_llm_max_tokens" integer DEFAULT 2000 NOT NULL,
	"mem_embedding_provider" text DEFAULT 'openai' NOT NULL,
	"mem_embedding_model" text DEFAULT 'text-embedding-3-small' NOT NULL,
	"mem_embedding_api_key" text NOT NULL,
	"mem_embedding_dimensions" integer DEFAULT 1536 NOT NULL,
	"mem_is_regenerating" boolean DEFAULT false NOT NULL,
	"mem_regeneration_progress" integer DEFAULT 0 NOT NULL,
	"mem_regeneration_total_items" integer DEFAULT 0 NOT NULL,
	"mem_regeneration_processed_items" integer DEFAULT 0 NOT NULL,
	"mem_regeneration_avg_batch_time_ms" integer DEFAULT 0 NOT NULL,
	"mem_regeneration_last_batch_time_ms" integer DEFAULT 0 NOT NULL,
	"mem_regeneration_current_batch_size" integer DEFAULT 50 NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_short_term_ideas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content" text NOT NULL,
	"source_type" text DEFAULT 'dream' NOT NULL,
	"source_id" text,
	"status" text DEFAULT 'new' NOT NULL,
	"excitement" integer DEFAULT 5 NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL,
	"updated_at" bigint DEFAULT 0 NOT NULL,
	"content_vector_1536" vector(1536),
	"content_vector_1024" vector(1024),
	"content_vector_768" vector(768),
	"deleted_at" bigint
);
--> statement-breakpoint
CREATE TABLE "memory_tag_relations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"memory_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_at" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "memory_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"color" text,
	"created_at" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "memory_tags_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "memory_access_patterns" ADD CONSTRAINT "memory_access_patterns_memory_id_memory_fragments_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_associations" ADD CONSTRAINT "memory_associations_source_memory_id_memory_fragments_id_fk" FOREIGN KEY ("source_memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_associations" ADD CONSTRAINT "memory_associations_target_memory_id_memory_fragments_id_fk" FOREIGN KEY ("target_memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_consolidation_events" ADD CONSTRAINT "memory_consolidation_events_memory_id_memory_fragments_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_relations" ADD CONSTRAINT "memory_entity_relations_memory_id_memory_fragments_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_entity_relations" ADD CONSTRAINT "memory_entity_relations_entity_id_memory_entities_id_fk" FOREIGN KEY ("entity_id") REFERENCES "public"."memory_entities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_fragments" ADD CONSTRAINT "memory_fragments_episode_id_memory_episodes_id_fk" FOREIGN KEY ("episode_id") REFERENCES "public"."memory_episodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_search_history" ADD CONSTRAINT "memory_search_history_selected_memory_id_memory_fragments_id_fk" FOREIGN KEY ("selected_memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_tag_relations" ADD CONSTRAINT "memory_tag_relations_memory_id_memory_fragments_id_fk" FOREIGN KEY ("memory_id") REFERENCES "public"."memory_fragments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memory_tag_relations" ADD CONSTRAINT "memory_tag_relations_tag_id_memory_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."memory_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_messages_unprocessed_index" ON "chat_messages" USING btree ("is_processed") WHERE "chat_messages"."is_processed" = false;--> statement-breakpoint
CREATE INDEX "chat_messages_content_vector_1536_index" ON "chat_messages" USING hnsw ("content_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chat_messages_content_vector_1024_index" ON "chat_messages" USING hnsw ("content_vector_1024" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "chat_messages_content_vector_768_index" ON "chat_messages" USING hnsw ("content_vector_768" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_access_patterns_memory_id_index" ON "memory_access_patterns" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_access_patterns_type_index" ON "memory_access_patterns" USING btree ("access_type");--> statement-breakpoint
CREATE INDEX "memory_access_patterns_created_at_index" ON "memory_access_patterns" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_associations_unique" ON "memory_associations" USING btree ("source_memory_id","target_memory_id","association_type");--> statement-breakpoint
CREATE INDEX "memory_associations_source_index" ON "memory_associations" USING btree ("source_memory_id");--> statement-breakpoint
CREATE INDEX "memory_associations_target_index" ON "memory_associations" USING btree ("target_memory_id");--> statement-breakpoint
CREATE INDEX "memory_associations_type_index" ON "memory_associations" USING btree ("association_type");--> statement-breakpoint
CREATE INDEX "memory_consolidated_memories_content_vector_1536_index" ON "memory_consolidated_memories" USING hnsw ("content_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_consolidated_memories_content_vector_1024_index" ON "memory_consolidated_memories" USING hnsw ("content_vector_1024" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_consolidated_memories_content_vector_768_index" ON "memory_consolidated_memories" USING hnsw ("content_vector_768" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_consolidated_memories_type_index" ON "memory_consolidated_memories" USING btree ("summary_type");--> statement-breakpoint
CREATE INDEX "memory_consolidated_memories_created_at_index" ON "memory_consolidated_memories" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_consolidated_memories_last_accessed_index" ON "memory_consolidated_memories" USING btree ("last_accessed");--> statement-breakpoint
CREATE INDEX "memory_consolidation_events_memory_id_index" ON "memory_consolidation_events" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_consolidation_events_type_index" ON "memory_consolidation_events" USING btree ("event_type");--> statement-breakpoint
CREATE INDEX "memory_consolidation_events_created_at_index" ON "memory_consolidation_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_entities_name_index" ON "memory_entities" USING btree ("name");--> statement-breakpoint
CREATE INDEX "memory_entities_type_index" ON "memory_entities" USING btree ("entity_type");--> statement-breakpoint
CREATE UNIQUE INDEX "memory_entity_relations_unique" ON "memory_entity_relations" USING btree ("memory_id","entity_id","relationship_type");--> statement-breakpoint
CREATE INDEX "memory_entity_relations_memory_id_index" ON "memory_entity_relations" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_entity_relations_entity_id_index" ON "memory_entity_relations" USING btree ("entity_id");--> statement-breakpoint
CREATE INDEX "memory_entity_relations_type_index" ON "memory_entity_relations" USING btree ("relationship_type");--> statement-breakpoint
CREATE INDEX "memory_episodes_episode_type_index" ON "memory_episodes" USING btree ("episode_type");--> statement-breakpoint
CREATE INDEX "memory_episodes_start_time_index" ON "memory_episodes" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "memory_episodes_is_processed_index" ON "memory_episodes" USING btree ("is_processed");--> statement-breakpoint
CREATE INDEX "memory_items_content_vector_1536_index" ON "memory_fragments" USING hnsw ("content_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_items_content_vector_1024_index" ON "memory_fragments" USING hnsw ("content_vector_1024" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_items_content_vector_768_index" ON "memory_fragments" USING hnsw ("content_vector_768" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_items_memory_type_index" ON "memory_fragments" USING btree ("memory_type");--> statement-breakpoint
CREATE INDEX "memory_items_category_index" ON "memory_fragments" USING btree ("category");--> statement-breakpoint
CREATE INDEX "memory_items_importance_index" ON "memory_fragments" USING btree ("importance");--> statement-breakpoint
CREATE INDEX "memory_items_created_at_index" ON "memory_fragments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_items_last_accessed_index" ON "memory_fragments" USING btree ("last_accessed");--> statement-breakpoint
CREATE INDEX "memory_items_episode_id_index" ON "memory_fragments" USING btree ("episode_id");--> statement-breakpoint
CREATE INDEX "memory_long_term_goals_priority_index" ON "memory_long_term_goals" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "memory_long_term_goals_status_index" ON "memory_long_term_goals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_long_term_goals_deadline_index" ON "memory_long_term_goals" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "memory_long_term_goals_parent_goal_id_index" ON "memory_long_term_goals" USING btree ("parent_goal_id");--> statement-breakpoint
CREATE INDEX "memory_search_history_query_index" ON "memory_search_history" USING btree ("query");--> statement-breakpoint
CREATE INDEX "memory_search_history_created_at_index" ON "memory_search_history" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "memory_settings_llm_provider_index" ON "memory_settings" USING btree ("mem_llm_provider");--> statement-breakpoint
CREATE INDEX "memory_settings_embedding_provider_index" ON "memory_settings" USING btree ("mem_embedding_provider");--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_source_type_index" ON "memory_short_term_ideas" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_status_index" ON "memory_short_term_ideas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_excitement_index" ON "memory_short_term_ideas" USING btree ("excitement");--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_content_vector_1536_index" ON "memory_short_term_ideas" USING hnsw ("content_vector_1536" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_content_vector_1024_index" ON "memory_short_term_ideas" USING hnsw ("content_vector_1024" vector_cosine_ops);--> statement-breakpoint
CREATE INDEX "memory_short_term_ideas_content_vector_768_index" ON "memory_short_term_ideas" USING hnsw ("content_vector_768" vector_cosine_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "memory_tag_relations_unique" ON "memory_tag_relations" USING btree ("memory_id","tag_id");--> statement-breakpoint
CREATE INDEX "memory_tag_relations_memory_id_index" ON "memory_tag_relations" USING btree ("memory_id");--> statement-breakpoint
CREATE INDEX "memory_tag_relations_tag_id_index" ON "memory_tag_relations" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "memory_tags_name_index" ON "memory_tags" USING btree ("name");