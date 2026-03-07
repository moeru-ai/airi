import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { index, integer, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

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
type ChatMemberType = 'user' | 'character' | 'bot'
type ChatMemberRole = 'owner' | 'admin' | 'member'

export const chats = pgTable(
  'chats',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),

    type: text('type').notNull().$type<ChatType>(),
    title: text('title'),

    maxSeq: integer('max_seq').default(0).notNull(),
    lastMessageAt: timestamp('last_message_at'),
    lastMessagePreview: text('last_message_preview'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
)

export type Chat = InferSelectModel<typeof chats>
export type NewChat = InferInsertModel<typeof chats>

export const chatMembers = pgTable(
  'chat_members',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
    memberType: text('member_type').notNull().$type<ChatMemberType>(),
    userId: text('user_id'),
    characterId: text('character_id'),
    role: text('role').$type<ChatMemberRole>().default('member').notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    lastReadSeq: integer('last_read_seq').default(0).notNull(),
  },
)

export type ChatMember = InferSelectModel<typeof chatMembers>
export type NewChatMember = InferInsertModel<typeof chatMembers>

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),

    chatId: text('chat_id').notNull().references(() => chats.id, { onDelete: 'cascade' }),
    seq: integer('seq').notNull(),
    parentId: text('parent_id'),

    senderId: text('sender_id').notNull(),
    role: text('role').notNull(),

    content: text('content').notNull(),
    mediaIds: text('media_ids').array().notNull(),
    stickerIds: text('sticker_ids').array().notNull(),

    replyToMessageId: text('reply_message_id'),
    forwardFromMessageId: text('forward_from_message_id'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    editedAt: timestamp('edited_at'),
    deletedAt: timestamp('deleted_at'),
  },
  t => [
    unique('messages_chat_id_seq_unique').on(t.chatId, t.seq),
    index('messages_parent_id_idx').on(t.parentId),
    index('messages_chat_id_seq_idx').on(t.chatId, t.seq),
  ],
)

export type Message = InferSelectModel<typeof messages>
export type NewMessage = InferInsertModel<typeof messages>
