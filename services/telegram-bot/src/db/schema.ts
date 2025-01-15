import { bigint, boolean, pgTable, text, uniqueIndex, uuid } from 'drizzle-orm/pg-core'

export const chatMessagesTable = pgTable('chat_messages', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  fromId: text().notNull().default(''),
  fromName: text().notNull().default(''),
  inChatId: text().notNull().default(''),
  content: text().notNull().default(''),
  isReply: boolean().notNull().default(false),
  replyToName: text().notNull().default(''),
  createdAt: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updatedAt: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
})

export const stickersTable = pgTable('stickers', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  fileId: text().notNull().default(''),
  imageBase64: text().notNull().default(''),
  imagePath: text().notNull().default(''),
  description: text().notNull().default(''),
  createdAt: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updatedAt: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
})

export const photosTable = pgTable('photos', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  fileId: text().notNull().default(''),
  imageBase64: text().notNull().default(''),
  imagePath: text().notNull().default(''),
  description: text().notNull().default(''),
  createdAt: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updatedAt: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
})

export const joinedChatsTable = pgTable('joined_chats', {
  id: uuid().primaryKey().defaultRandom(),
  platform: text().notNull().default(''),
  chatId: text().notNull().default(''),
  chatName: text().notNull().default(''),
  createdAt: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
  updatedAt: bigint({ mode: 'number' }).notNull().default(0).$defaultFn(() => Date.now()),
}, (table) => {
  return {
    uniquePlatformChatId: uniqueIndex('platform_chat_id_unique_index').on(table.platform, table.chatId),
  }
})
