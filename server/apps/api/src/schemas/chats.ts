import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { sql } from 'drizzle-orm'
import { index, integer, pgTable, text, timestamp } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export const media = pgTable(
  'media',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    mimeType: text('mime_type').notNull(),
    size: integer('size').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    url: text('url').notNull(),
  },
)

export const stickers = pgTable(
  'stickers',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    url: text('url').notNull(),
  },
)

export const stickerPacks = pgTable(
  'sticker_packs',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),
    description: text('description').notNull(),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    name: text('name').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

type ChatMemberType = 'bot' | 'character' | 'user'
type ChatType = 'bot' | 'channel' | 'group' | 'private'

export const chats = pgTable(
  'chats',
  {
    createdAt: timestamp('created_at').defaultNow().notNull(),

    deletedAt: timestamp('deleted_at'),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),

    title: text('title'),
    type: text('type').notNull().$type<ChatType>(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
)

export type Chat = InferSelectModel<typeof chats>
export type NewChat = InferInsertModel<typeof chats>

export const chatMembers = pgTable(
  'chat_members',
  {
    characterId: text('character_id'),
    chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    memberType: text('member_type').notNull().$type<ChatMemberType>(),
    userId: text('user_id'),
  },
  table => [
    index('chat_members_user_id_member_type_chat_id_idx').on(table.userId, table.memberType, table.chatId),
    index('chat_members_chat_id_member_type_user_id_idx').on(table.chatId, table.memberType, table.userId),
  ],
)

export const messages = pgTable(
  'messages',
  {
    chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),

    content: text('content').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
    forwardFromMessageId: text('forward_from_message_id'),

    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    mediaIds: text('media_ids').array().notNull(),
    replyToMessageId: text('reply_message_id'),

    role: text('role').notNull(),
    senderId: text('sender_id'),

    seq: integer('seq'),
    stickerIds: text('sticker_ids').array().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    index('messages_chat_id_seq_idx').on(table.chatId, table.seq),
    index('messages_chat_id_seq_active_idx')
      .on(table.chatId, table.seq)
      .where(sql`${table.deletedAt} IS NULL`),
  ],
)

export type Message = InferSelectModel<typeof messages>
export type NewMessage = InferInsertModel<typeof messages>
