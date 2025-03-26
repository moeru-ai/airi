import { bigint, boolean, index, pgTable, text, uniqueIndex, uuid, vector } from 'drizzle-orm/pg-core'

export const chatMessagesTable = pgTable('chat_messages', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  from_id: text().notNull().default(''),
  from_name: text().notNull().default(''),
  in_chat_id: text().notNull().default(''),
  content: text().notNull().default(''),
  is_reply: boolean().notNull().default(false),
  reply_to_name: text().notNull().default(''),
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

export const photosTable = pgTable('photos', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
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
