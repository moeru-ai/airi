ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "chat_messages_model_name_index" ON "chat_messages" ("model_name");

ALTER TABLE "chat_completions_history" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "chat_completions_history_model_name_index" ON "chat_completions_history" ("model_name");

ALTER TABLE "memory_episodes" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_episodes_model_name_index" ON "memory_episodes" ("model_name");

ALTER TABLE "memory_fragments" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_items_model_name_index" ON "memory_fragments" ("model_name");

ALTER TABLE "memory_entities" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
ALTER TABLE "memory_entities" DROP CONSTRAINT IF EXISTS "memory_entities_name_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "memory_entities_model_name_name_unique" ON "memory_entities" ("model_name", "name");
CREATE INDEX IF NOT EXISTS "memory_entities_model_name_index" ON "memory_entities" ("model_name");

ALTER TABLE "memory_entity_relations" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_entity_relations_model_name_index" ON "memory_entity_relations" ("model_name");

ALTER TABLE "memory_associations" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_associations_model_name_index" ON "memory_associations" ("model_name");

ALTER TABLE "memory_consolidation_events" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_consolidation_events_model_name_index" ON "memory_consolidation_events" ("model_name");

ALTER TABLE "memory_tags" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
ALTER TABLE "memory_tags" DROP CONSTRAINT IF EXISTS "memory_tags_name_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "memory_tags_model_name_name_unique" ON "memory_tags" ("model_name", "name");
CREATE INDEX IF NOT EXISTS "memory_tags_model_name_index" ON "memory_tags" ("model_name");

ALTER TABLE "memory_tag_relations" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_tag_relations_model_name_index" ON "memory_tag_relations" ("model_name");

ALTER TABLE "memory_search_history" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_search_history_model_name_index" ON "memory_search_history" ("model_name");

ALTER TABLE "memory_access_patterns" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_access_patterns_model_name_index" ON "memory_access_patterns" ("model_name");

ALTER TABLE "memory_long_term_goals" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_long_term_goals_model_name_index" ON "memory_long_term_goals" ("model_name");

ALTER TABLE "memory_short_term_ideas" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_short_term_ideas_model_name_index" ON "memory_short_term_ideas" ("model_name");

ALTER TABLE "memory_consolidated_memories" ADD COLUMN IF NOT EXISTS "model_name" text NOT NULL DEFAULT 'default';
CREATE INDEX IF NOT EXISTS "memory_consolidated_memories_model_name_index" ON "memory_consolidated_memories" ("model_name");
