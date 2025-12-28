import { integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { user } from './accounts'

export const media = pgTable(
  'media',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export const sticker = pgTable(
  'sticker',
  {
    id: text('id').primaryKey(),
    url: text('url').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export const stickerPack = pgTable(
  'sticker_pack',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    description: text('description').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

type ChatType = 'private' | 'bot' | 'group' | 'channel'

export const chat = pgTable(
  'chat',
  {
    id: text('id').primaryKey(),

    type: text('type').notNull().$type<ChatType>(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)

export const chatMember = pgTable(
  'chat_member',
  {
    id: text('id').primaryKey(),
    chatId: text('chat_id').notNull().references(() => chat.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
  },
)

export const message = pgTable(
  'message',
  {
    id: text('id').primaryKey(),

    chatId: text('chat_id').notNull().references(() => chat.id, { onDelete: 'cascade' }),
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
