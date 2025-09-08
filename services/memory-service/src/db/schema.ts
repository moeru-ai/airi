import { sql } from 'drizzle-orm'
import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core'

export const chatMessagesTable = pgTable('chat_messages', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  content: text().notNull().default(''),
  is_processed: boolean().notNull().default(false), // Flag for processing status
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  content_vector_1536: vector({ dimensions: 1536 }),
  content_vector_1024: vector({ dimensions: 1024 }),
  content_vector_768: vector({ dimensions: 768 }),
}, table => [
  // Partial index for unprocessed messages - only indexes FALSE values
  index('chat_messages_unprocessed_index').on(table.is_processed).where(sql`${table.is_processed} = false`),
  // Vector indexes for similarity search
  index('chat_messages_content_vector_1536_index').using('hnsw', table.content_vector_1536.op('vector_cosine_ops')),
  index('chat_messages_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
  index('chat_messages_content_vector_768_index').using('hnsw', table.content_vector_768.op('vector_cosine_ops')),
])

export const chatCompletionsHistoryTable = pgTable('chat_completions_history', {
  id: uuid().primaryKey().defaultRandom(),
  prompt: text().notNull(),
  response: text().notNull(),
  task: text().notNull(),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
})

// Episodic Memory Table
// Groups related memories (e.g., a single conversation or event) into a cohesive unit.
// This gives memories chronological and situational context.
export const memoryEpisodesTable = pgTable('memory_episodes', {
  id: uuid().primaryKey().defaultRandom(),
  episode_type: text().notNull(), // 'chat_session', 'dream', 'meditation', etc.
  title: text().notNull(),
  start_time: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  end_time: bigint({ mode: 'number' }),
  is_processed: boolean().notNull().default(false),
  metadata: jsonb().notNull().default({}),
}, table => [
  index('memory_episodes_episode_type_index').on(table.episode_type),
  index('memory_episodes_start_time_index').on(table.start_time),
  index('memory_episodes_is_processed_index').on(table.is_processed),
])

// Memory Item table - base table for all memories
export const memoryFragmentsTable = pgTable('memory_fragments', {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull(),
  memory_type: text().notNull(), // 'working', 'short_term', 'long_term', 'muscle'
  category: text().notNull(), // 'chat', 'relationships', 'people', 'life', etc.
  importance: integer().notNull().default(5), // 1-10 scale
  emotional_impact: integer().notNull().default(0), // -10 to 10 scale
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  last_accessed: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  access_count: integer().notNull().default(1),
  metadata: jsonb().notNull().default({}),
  content_vector_1536: vector({ dimensions: 1536 }),
  content_vector_1024: vector({ dimensions: 1024 }),
  content_vector_768: vector({ dimensions: 768 }),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
  // Link to episodes for contextual grouping
  episode_id: uuid().references(() => memoryEpisodesTable.id, { onDelete: 'set null' }),
}, table => [
  // Vector indexes for efficient similarity search
  index('memory_items_content_vector_1536_index').using('hnsw', table.content_vector_1536.op('vector_cosine_ops')),
  index('memory_items_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
  index('memory_items_content_vector_768_index').using('hnsw', table.content_vector_768.op('vector_cosine_ops')),
  // Standard indexes for common queries
  index('memory_items_memory_type_index').on(table.memory_type),
  index('memory_items_category_index').on(table.category),
  index('memory_items_importance_index').on(table.importance),
  index('memory_items_created_at_index').on(table.created_at),
  index('memory_items_last_accessed_index').on(table.last_accessed),
  // Episode relationship index
  index('memory_items_episode_id_index').on(table.episode_id),
])

// Entity Knowledge Tables
// Stores information about key entities (people, places, things) and links them to memories.
export const memoryEntitiesTable = pgTable('memory_entities', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  entity_type: text().notNull(), // 'person', 'place', 'organization', 'concept'
  description: text(),
  metadata: jsonb().notNull().default({}),
}, table => [
  index('memory_entities_name_index').on(table.name),
  index('memory_entities_type_index').on(table.entity_type),
])

// Relationship table to link memories to entities
export const memoryEntityRelationsTable = pgTable('memory_entity_relations', {
  id: uuid().primaryKey().defaultRandom(),
  memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  entity_id: uuid().notNull().references(() => memoryEntitiesTable.id, { onDelete: 'cascade' }),
  importance: integer().notNull().default(5), // How important is this entity to the memory
  relationship_type: text().notNull().default('mentioned'), // 'mentioned', 'acted', 'experienced', 'created'
  confidence: integer().notNull().default(5), // How sure are we about this relation (1-10)
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('memory_entity_relations_unique').on(table.memory_id, table.entity_id, table.relationship_type),
  index('memory_entity_relations_memory_id_index').on(table.memory_id),
  index('memory_entity_relations_entity_id_index').on(table.entity_id),
  index('memory_entity_relations_type_index').on(table.relationship_type),
])

// Memory Associations table - for linking related memories
export const memoryAssociationsTable = pgTable('memory_associations', {
  id: uuid().primaryKey().defaultRandom(),
  source_memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  target_memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  association_type: text().notNull(), // 'similar', 'related', 'opposite', 'temporal', etc.
  strength: integer().notNull().default(5), // 1-10 scale
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  metadata: jsonb().notNull().default({}),
}, table => [
  uniqueIndex('memory_associations_unique').on(table.source_memory_id, table.target_memory_id, table.association_type),
  index('memory_associations_source_index').on(table.source_memory_id),
  index('memory_associations_target_index').on(table.target_memory_id),
  index('memory_associations_type_index').on(table.association_type),
])

// Memory Consolidation Events table - for tracking memory processing
export const memoryConsolidationEventsTable = pgTable('memory_consolidation_events', {
  id: uuid().primaryKey().defaultRandom(),
  memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  event_type: text().notNull(), // 'created', 'accessed', 'consolidated', 'forgotten', etc.
  consolidation_score: integer(), // nullable, only for consolidation events
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  metadata: jsonb().notNull().default({}),
}, table => [
  index('memory_consolidation_events_memory_id_index').on(table.memory_id),
  index('memory_consolidation_events_type_index').on(table.event_type),
  index('memory_consolidation_events_created_at_index').on(table.created_at),
])

// Memory Tags table - for flexible categorization
export const memoryTagsTable = pgTable('memory_tags', {
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().unique(),
  description: text(),
  color: text(), // hex color code
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  index('memory_tags_name_index').on(table.name),
])

// Memory-Tag relationships table
export const memoryTagRelationsTable = pgTable('memory_tag_relations', {
  id: uuid().primaryKey().defaultRandom(),
  memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  tag_id: uuid().notNull().references(() => memoryTagsTable.id, { onDelete: 'cascade' }),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('memory_tag_relations_unique').on(table.memory_id, table.tag_id),
  index('memory_tag_relations_memory_id_index').on(table.memory_id),
  index('memory_tag_relations_tag_id_index').on(table.tag_id),
])

// Memory Search History table - for improving search relevance
export const memorySearchHistoryTable = pgTable('memory_search_history', {
  id: uuid().primaryKey().defaultRandom(),
  query: text().notNull(),
  results_count: integer().notNull(),
  selected_memory_id: uuid().references(() => memoryFragmentsTable.id, { onDelete: 'set null' }),
  search_duration_ms: integer(),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  metadata: jsonb().notNull().default({}),
}, table => [
  index('memory_search_history_query_index').on(table.query),
  index('memory_search_history_created_at_index').on(table.created_at),
])

// Memory Access Patterns table - for understanding usage patterns
export const memoryAccessPatternsTable = pgTable('memory_access_patterns', {
  id: uuid().primaryKey().defaultRandom(),
  memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  access_type: text().notNull(), // 'read', 'search', 'consolidation', 'forgetting'
  context: text(), // what triggered this access
  duration_ms: integer(), // how long the memory was accessed
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  metadata: jsonb().notNull().default({}),
}, table => [
  index('memory_access_patterns_memory_id_index').on(table.memory_id),
  index('memory_access_patterns_type_index').on(table.access_type),
  index('memory_access_patterns_created_at_index').on(table.created_at),
])

// Goals table - for tracking user goals and objectives
export const memoryLongTermGoalsTable = pgTable('memory_long_term_goals', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  description: text().notNull(),
  priority: integer().notNull().default(5), // 1-10 scale
  progress: integer().notNull().default(0), // 0-100 percentage
  deadline: bigint({ mode: 'number' }), // nullable timestamp
  status: text().notNull().default('planned'), // 'planned', 'in_progress', 'completed', 'abandoned'
  parent_goal_id: uuid(), // nullable, self-reference will be added after table definition
  category: text().notNull().default('personal'),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
}, table => [
  index('memory_long_term_goals_priority_index').on(table.priority),
  index('memory_long_term_goals_status_index').on(table.status),
  index('memory_long_term_goals_deadline_index').on(table.deadline),
  index('memory_long_term_goals_parent_goal_id_index').on(table.parent_goal_id),
])

// Ideas generated from dreams or normal thinking
export const memoryShortTermIdeasTable = pgTable('memory_short_term_ideas', {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull(),
  source_type: text().notNull().default('dream'), // 'dream', 'conversation', 'reflection'
  source_id: text(), // nullable ID of source (dream ID, conversation ID, etc.)
  status: text().notNull().default('new'), // 'new', 'developing', 'implemented', 'abandoned'
  excitement: integer().notNull().default(5), // 1-10 scale
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  content_vector_1536: vector({ dimensions: 1536 }),
  content_vector_1024: vector({ dimensions: 1024 }),
  content_vector_768: vector({ dimensions: 768 }),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
}, table => [
  index('memory_short_term_ideas_source_type_index').on(table.source_type),
  index('memory_short_term_ideas_status_index').on(table.status),
  index('memory_short_term_ideas_excitement_index').on(table.excitement),
  index('memory_short_term_ideas_content_vector_1536_index').using('hnsw', table.content_vector_1536.op('vector_cosine_ops')),
  index('memory_short_term_ideas_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
  index('memory_short_term_ideas_content_vector_768_index').using('hnsw', table.content_vector_768.op('vector_cosine_ops')),
])

// Consolidated/Summary Memories Table
// Stores high-level summaries to speed up initial retrieval and provide broad context.
export const memoryConsolidatedMemoriesTable = pgTable('memory_consolidated_memories', {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull(),
  summary_type: text().notNull(), // 'summary', 'insight', 'lesson', 'narrative'
  source_fragment_ids: jsonb().notNull().default('[]'), // Array of UUIDs from memoryFragmentsTable
  source_episode_ids: jsonb().notNull().default('[]'), // Array of UUIDs from memoryEpisodesTable
  metadata: jsonb().notNull().default({}),
  content_vector_1536: vector({ dimensions: 1536 }),
  content_vector_1024: vector({ dimensions: 1024 }),
  content_vector_768: vector({ dimensions: 768 }),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  last_accessed: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  // Vector indexes for semantic search on summaries
  index('memory_consolidated_memories_content_vector_1536_index').using('hnsw', table.content_vector_1536.op('vector_cosine_ops')),
  index('memory_consolidated_memories_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
  index('memory_consolidated_memories_content_vector_768_index').using('hnsw', table.content_vector_768.op('vector_cosine_ops')),
  // Standard indexes for common queries
  index('memory_consolidated_memories_type_index').on(table.summary_type),
  index('memory_consolidated_memories_created_at_index').on(table.created_at),
  index('memory_consolidated_memories_last_accessed_index').on(table.last_accessed),
])

// Settings table - for storing LLM and embedding configuration
export const memorySettingsTable = pgTable('memory_settings', {
  id: uuid().primaryKey().defaultRandom(),
  // LLM Settings
  mem_llm_provider: text().notNull().default('openai'),
  mem_llm_model: text().notNull().default('gpt-3.5-turbo'),
  mem_llm_api_key: text().notNull(),
  mem_llm_temperature: integer().notNull().default(7), // 0-10 scale, divide by 10 for actual temp
  mem_llm_max_tokens: integer().notNull().default(2000),

  // Embedding Settings
  mem_embedding_provider: text().notNull().default('openai'),
  mem_embedding_model: text().notNull().default('text-embedding-3-small'),
  mem_embedding_api_key: text().notNull(),
  mem_embedding_dimensions: integer().notNull().default(1536),

  // Regeneration State
  mem_is_regenerating: boolean().notNull().default(false),
  mem_regeneration_progress: integer().notNull().default(0), // 0-100 percentage
  mem_regeneration_total_items: integer().notNull().default(0),
  mem_regeneration_processed_items: integer().notNull().default(0),
  mem_regeneration_avg_batch_time_ms: integer().notNull().default(0), // For dynamic batch sizing
  mem_regeneration_last_batch_time_ms: integer().notNull().default(0), // For trend analysis
  mem_regeneration_current_batch_size: integer().notNull().default(50), // Current dynamic batch size

  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  // No need for key/type indexes anymore since each setting is a column
  // Add indexes for frequently queried settings if needed
  index('memory_settings_llm_provider_index').on(table.mem_llm_provider),
  index('memory_settings_embedding_provider_index').on(table.mem_embedding_provider),
])
