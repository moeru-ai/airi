import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'

export const media = pgTable(
  'media',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    url: text('url').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export const stickers = pgTable(
  'stickers',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    url: text('url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export const stickerPacks = pgTable(
  'sticker_packs',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

type ChatType = 'private' | 'bot' | 'group' | 'channel'

export const chats = pgTable(
  'chats',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),

    type: text('type').notNull().$type<ChatType>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)

export const chatMembers = pgTable(
  'chat_members',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
)

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),

    chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
    senderId: text('sender_id').notNull(),

    content: text('content').notNull(),
    mediaIds: text('media_ids').array().notNull(),
    stickerIds: text('sticker_ids').array().notNull(),

    replyToMessageId: text('reply_message_id'),
    forwardFromMessageId: text('forward_from_message_id'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)
