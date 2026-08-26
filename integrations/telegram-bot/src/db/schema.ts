import { bigint, boolean, index, integer, jsonb, pgTable, text, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core'

export const chatMessagesTable = pgTable('chat_messages', {
  content: text().notNull().default(''),
  content_vector_768: vector({ dimensions: 768 }),
  content_vector_1024: vector({ dimensions: 1024 }),
  content_vector_1536: vector({ dimensions: 1536 }),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  from_id: text().notNull().default(''),
  from_name: text().notNull().default(''),
  id: uuid().primaryKey().defaultRandom(),
  in_chat_id: text().notNull().default(''),
  is_reply: boolean().notNull().default(false),
  platform: text().notNull().default(''),
  platform_message_id: text().notNull().default(''),
  reply_to_id: text().notNull().default(''),
  reply_to_name: text().notNull().default(''),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  index('chat_messages_content_vector_1536_index').using('hnsw', table.content_vector_1536.op('vector_cosine_ops')),
  index('chat_messages_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
  index('chat_messages_content_vector_768_index').using('hnsw', table.content_vector_768.op('vector_cosine_ops')),
])

export const stickersTable = pgTable('stickers', {
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  description: text().notNull().default(''),
  description_vector_768: vector({ dimensions: 768 }),
  description_vector_1024: vector({ dimensions: 1024 }),
  description_vector_1536: vector({ dimensions: 1536 }),
  emoji: text().notNull().default(''),
  file_id: text().notNull().default(''),
  id: uuid().primaryKey().defaultRandom(),
  image_base64: text().notNull().default(''),
  image_path: text().notNull().default(''),
  label: text().notNull().default(''),
  name: text().notNull().default(''),
  platform: text().notNull().default(''),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  index('stickers_description_vector_1536_index').using('hnsw', table.description_vector_1536.op('vector_cosine_ops')),
  index('stickers_description_vector_1024_index').using('hnsw', table.description_vector_1024.op('vector_cosine_ops')),
  index('stickers_description_vector_768_index').using('hnsw', table.description_vector_768.op('vector_cosine_ops')),
])

export const stickerPacksTable = pgTable('sticker_packs', {
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  description: text().notNull().default(''),
  id: uuid().primaryKey().defaultRandom(),
  name: text().notNull().default(''),
  platform: text().notNull().default(''),
  platform_id: text().notNull().default(''),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  uniqueIndex('sticker_packs_platform_platform_id_unique_index').on(table.platform, table.platform_id),
])

export const recentSentStickersTable = pgTable('recent_sent_stickers', {
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  id: uuid().primaryKey().defaultRandom(),
  sticker_id: uuid().notNull().references(() => stickersTable.id, { onDelete: 'cascade' }),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
})

export const photosTable = pgTable('photos', {
  caption: text().notNull().default(''),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  description: text().notNull().default(''),
  description_vector_768: vector({ dimensions: 768 }),
  description_vector_1024: vector({ dimensions: 1024 }),
  description_vector_1536: vector({ dimensions: 1536 }),
  file_id: text().notNull().default(''),
  id: uuid().primaryKey().defaultRandom(),
  image_base64: text().notNull().default(''),
  image_path: text().notNull().default(''),
  platform: text().notNull().default(''),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  index('photos_description_vector_1536_index').using('hnsw', table.description_vector_1536.op('vector_cosine_ops')),
  index('photos_description_vector_1024_index').using('hnsw', table.description_vector_1024.op('vector_cosine_ops')),
  index('photos_description_vector_768_index').using('hnsw', table.description_vector_768.op('vector_cosine_ops')),
])

export const joinedChatsTable = pgTable('joined_chats', () => {
  return {
    chat_id: text().notNull().default('').unique(),
    chat_name: text().notNull().default(''),
    created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
    id: uuid().primaryKey().defaultRandom(),
    platform: text().notNull().default(''),
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
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  id: uuid().primaryKey().defaultRandom(),
  prompt: text().notNull(),
  response: text().notNull(),
  task: text().notNull(),
})

// Memory Item table - base table for all memories
export const memoryFragmentsTable = pgTable('memory_fragments', {
  access_count: integer().notNull().default(1),
  category: text().notNull(), // 'chat', 'relationships', 'people', 'life', etc.
  content: text().notNull(),
  content_vector_768: vector({ dimensions: 768 }),
  content_vector_1024: vector({ dimensions: 1024 }),
  content_vector_1536: vector({ dimensions: 1536 }),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
  emotional_impact: integer().notNull().default(0), // -10 to 10 scale
  id: uuid().primaryKey().defaultRandom(),
  importance: integer().notNull().default(5), // 1-10 scale
  last_accessed: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  memory_type: text().notNull(), // 'working', 'short_term', 'long_term', 'muscle'
  metadata: jsonb().notNull().default({}),
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
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
  id: uuid().primaryKey().defaultRandom(),
  memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  tag: text().notNull(),
}, table => [
  index('memory_tags_memory_id_index').on(table.memory_id),
  index('memory_tags_tag_index').on(table.tag),
])

// Episodic Memory (specific events)
export const memoryEpisodicTable = pgTable('memory_episodic', {
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
  event_type: text().notNull(), // 'conversation', 'introduction', 'argument', etc.
  id: uuid().primaryKey().defaultRandom(),
  location: text().default(''),
  memory_id: uuid().notNull().references(() => memoryFragmentsTable.id, { onDelete: 'cascade' }),
  participants: jsonb().notNull().default([]), // Array of participant IDs
}, table => [
  index('memory_episodic_memory_id_index').on(table.memory_id),
  index('memory_episodic_event_type_index').on(table.event_type),
])

// Goals table
export const memoryLongTermGoalsTable = pgTable('memory_long_term_goals', {
  category: text().notNull().default('personal'),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  deadline: bigint({ mode: 'number' }).default(null),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
  description: text().notNull(),
  id: uuid().primaryKey().defaultRandom(),
  parent_goal_id: uuid().references(() => memoryLongTermGoalsTable.id),
  priority: integer().notNull().default(5), // 1-10 scale
  progress: integer().notNull().default(0), // 0-100 percentage
  status: text().notNull().default('planned'), // 'planned', 'in_progress', 'completed', 'abandoned'
  title: text().notNull(),
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  index('memory_long_term_goals_priority_index').on(table.priority),
  index('memory_long_term_goals_status_index').on(table.status),
  index('memory_long_term_goals_deadline_index').on(table.deadline),
  index('memory_long_term_goals_parent_goal_id_index').on(table.parent_goal_id),
])

// Ideas generated from dreams or normal thinking
export const memoryShortTermIdeas = pgTable('memory_short_term_ideas', {
  content: text().notNull(),
  content_vector_768: vector({ dimensions: 768 }),
  content_vector_1024: vector({ dimensions: 1024 }),
  content_vector_1536: vector({ dimensions: 1536 }),
  created_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  deleted_at: bigint({ mode: 'number' }), // nullable timestamp for soft delete
  excitement: integer().notNull().default(5), // 1-10 scale
  id: uuid().primaryKey().defaultRandom(),
  source_id: text().default(null), // ID of source (dream ID, conversation ID, etc.)
  source_type: text().notNull().default('dream'), // 'dream', 'conversation', 'reflection'
  status: text().notNull().default('new'), // 'new', 'developing', 'implemented', 'abandoned'
  updated_at: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, table => [
  index('memory_short_term_ideas_source_type_index').on(table.source_type),
  index('memory_short_term_ideas_status_index').on(table.status),
  index('memory_short_term_ideas_excitement_index').on(table.excitement),
  index('memory_short_term_ideas_content_vector_1536_index').using('hnsw', table.content_vector_1536.op('vector_cosine_ops')),
  index('memory_short_term_ideas_content_vector_1024_index').using('hnsw', table.content_vector_1024.op('vector_cosine_ops')),
  index('memory_short_term_ideas_content_vector_768_index').using('hnsw', table.content_vector_768.op('vector_cosine_ops')),
])
