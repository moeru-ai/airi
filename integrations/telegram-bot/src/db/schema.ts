import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core'

export const chatMessagesTable = pgTable('chat_messages', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  platform_message_id: text().notNull().default(''),
  from_id: text().notNull().default(''),
  from_name: text().notNull().default(''),
  in_chat_id: text().notNull().default(''),
  content: text().notNull().default(''),
  is_reply: boolean().notNull().default(false),
  reply_to_name: text().notNull().default(''),
  reply_to_id: text().notNull().default(''),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  content_vector_1536: vector({ dimensions: 1536 }),
  content_vector_1024: vector({ dimensions: 1024 }),
  content_vector_768: vector({ dimensions: 768 }),
}, table => [
  index('chat_messages_content_vector_1536_index').using('hnsw', table.content_vector_1536.op('vector_cosine_ops')),
  index('chat_messages_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
  index('chat_messages_content_vector_768_index').using('hnsw', table.content_vector_768.op('vector_cosine_ops')),
])

export const stickersTable = pgTable('stickers', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  name: text().notNull().default(''),
  emoji: text().notNull().default(''),
  label: text().notNull().default(''),
  file_id: text().notNull().default(''),
  image_base64: text().notNull().default(''),
  image_path: text().notNull().default(''),
  description: text().notNull().default(''),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  description_vector_1536: vector({ dimensions: 1536 }),
  description_vector_1024: vector({ dimensions: 1024 }),
  description_vector_768: vector({ dimensions: 768 }),
}, table => [
  index('stickers_description_vector_1536_index').using('hnsw', table.description_vector_1536.op('vector_cosine_ops')),
  index('stickers_description_vector_1024_index').using('hnsw', table.description_vector_1024.op('vector_cosine_ops')),
  index('stickers_description_vector_768_index').using('hnsw', table.description_vector_768.op('vector_cosine_ops')),
])

export const stickerPacksTable = pgTable('sticker_packs', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  platform_id: text().notNull().default(''),
  name: text().notNull().default(''),
  description: text().notNull().default(''),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('sticker_packs_platform_platform_id_unique_index').on(table.platform, table.platform_id),
])

export const recentSentStickersTable = pgTable('recent_sent_stickers', {
  id: uuid().primaryKey().defaultRandom(),
  sticker_id: uuid().notNull().references(() => stickersTable.id, { onDelete: 'cascade' }),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
})

export const photosTable = pgTable('photos', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  file_id: text().notNull().default(''),
  image_base64: text().notNull().default(''),
  image_path: text().notNull().default(''),
  caption: text().notNull().default(''),
  description: text().notNull().default(''),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  description_vector_1536: vector({ dimensions: 1536 }),
  description_vector_1024: vector({ dimensions: 1024 }),
  description_vector_768: vector({ dimensions: 768 }),
}, table => [
  index('photos_description_vector_1536_index').using('hnsw', table.description_vector_1536.op('vector_cosine_ops')),
  index('photos_description_vector_1024_index').using('hnsw', table.description_vector_1024.op('vector_cosine_ops')),
  index('photos_description_vector_768_index').using('hnsw', table.description_vector_768.op('vector_cosine_ops')),
])

export const joinedChatsTable = pgTable('joined_chats', () => {
  return {
    id: uuid().primaryKey().defaultRandom(),
    platform: text().notNull().default(''),
    chat_id: text().notNull().default('').unique(),
    chat_name: text().notNull().default(''),
    created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
    updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  }
}, (table) => {
  return [
    {
      uniquePlatformChatId: uniqueIndex('platform_chat_id_unique_index').on(table.platform, table.chat_id),
    },
  ]
})

export const chatCompletionsHistoryTable = pgTable('chat_completions_history', {
  id: uuid().primaryKey().defaultRandom(),
  prompt: text().notNull(),
  response: text().notNull(),
  task: text().notNull(),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
})

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
])

// Memory Tags junction table
export const memoryTagsTable = pgTable('memory_tags', {
  id: uuid().primaryKey().defaultRandom(),
  memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  tag: text().notNull(),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
}, table => [
  index('memory_tags_memory_id_index').on(table.memory_id),
  index('memory_tags_tag_index').on(table.tag),
])

// Episodic Memory (specific events)
export const memoryEpisodicTable = pgTable('memory_episodic', {
  id: uuid().primaryKey().defaultRandom(),
  memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  event_type: text().notNull(), // 'conversation', 'introduction', 'argument', etc.
  participants: jsonb().notNull().default([]), // Array of participant IDs
  location: text().default(''),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
}, table => [
  index('memory_episodic_memory_id_index').on(table.memory_id),
  index('memory_episodic_event_type_index').on(table.event_type),
])

// Goals table
export const memoryLongTermGoalsTable = pgTable('memory_long_term_goals', {
  id: uuid().primaryKey().defaultRandom(),
  title: text().notNull(),
  description: text().notNull(),
  priority: integer().notNull().default(5), // 1-10 scale
  progress: integer().notNull().default(0), // 0-100 percentage
  deadline: bigint({ mode: 'number' }).default(null),
  status: text().notNull().default('planned'), // 'planned', 'in_progress', 'completed', 'abandoned'
  parent_goal_id: uuid().references(() => memoryLongTermGoalsTable.id),
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
export const memoryShortTermIdeas = pgTable('memory_short_term_ideas', {
  id: uuid().primaryKey().defaultRandom(),
  content: text().notNull(),
  source_type: text().notNull().default('dream'), // 'dream', 'conversation', 'reflection'
  source_id: text().default(null), // ID of source (dream ID, conversation ID, etc.)
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
