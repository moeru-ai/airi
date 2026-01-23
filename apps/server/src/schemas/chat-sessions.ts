import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'

import { relations } from 'drizzle-orm'
import { index, jsonb, pgTable, text, timestamp, vector } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'
import { user } from './accounts'

export const chatSessions = pgTable(
  'chat_sessions',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),
    characterId: text('character_id').notNull(), // No strict FK to allow local-only characters or loose coupling

    title: text('title'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    deletedAt: timestamp('deleted_at'),
  },
  t => [
    index('chat_sessions_user_id_idx').on(t.userId),
    index('chat_sessions_character_id_idx').on(t.characterId),
  ],
)

export type ChatSession = InferSelectModel<typeof chatSessions>
export type NewChatSession = InferInsertModel<typeof chatSessions>

export const chatMessages = pgTable(
  'chat_messages',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    sessionId: text('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
    userId: text('user_id').notNull().references(() => user.id, { onDelete: 'cascade' }),

    role: text('role').notNull(),
    content: text('content').notNull(),

    // Store full raw message object for fidelity (including metadata, context, etc.)
    raw: jsonb('raw').notNull(),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  t => [
    index('chat_messages_session_id_idx').on(t.sessionId),
    index('chat_messages_user_id_idx').on(t.userId),
    index('chat_messages_created_at_idx').on(t.createdAt),
  ],
)

export type ChatMessage = InferSelectModel<typeof chatMessages>
export type NewChatMessage = InferInsertModel<typeof chatMessages>

export const chatProcessJobs = pgTable(
  'chat_process_jobs',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    sessionId: text('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),

    status: text('status').notNull().default('pending'), // pending, processing, completed, failed

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  t => [
    index('chat_process_jobs_session_id_idx').on(t.sessionId),
    index('chat_process_jobs_status_idx').on(t.status),
  ],
)

export type ChatProcessJob = InferSelectModel<typeof chatProcessJobs>
export type NewChatProcessJob = InferInsertModel<typeof chatProcessJobs>

export const chatMessageEmbeddings = pgTable(
  'chat_message_embeddings',
  {
    id: text('id').primaryKey().$defaultFn(() => nanoid()),
    sessionId: text('session_id').notNull().references(() => chatSessions.id, { onDelete: 'cascade' }),
    messageId: text('message_id').notNull().references(() => chatMessages.id, { onDelete: 'cascade' }),

    vector: vector({ dimensions: 1536 }).notNull(),

    metadata: jsonb('metadata'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  t => [
    index('chat_message_embeddings_session_id_idx').on(t.sessionId),
    index('chat_message_embeddings_message_id_idx').on(t.messageId),
  ],
)

export type ChatMessageEmbedding = InferSelectModel<typeof chatMessageEmbeddings>
export type NewChatMessageEmbedding = InferInsertModel<typeof chatMessageEmbeddings>

export const chatSessionsRelations = relations(chatSessions, ({ one, many }) => ({
  user: one(user, {
    fields: [chatSessions.userId],
    references: [user.id],
  }),
  messages: many(chatMessages),
  processJobs: many(chatProcessJobs),
  embeddings: many(chatMessageEmbeddings),
}))

export const chatMessagesRelations = relations(chatMessages, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessages.sessionId],
    references: [chatSessions.id],
  }),
  user: one(user, {
    fields: [chatMessages.userId],
    references: [user.id],
  }),
  embedding: one(chatMessageEmbeddings, {
    fields: [chatMessages.id],
    references: [chatMessageEmbeddings.messageId],
  }),
}))

export const chatProcessJobsRelations = relations(chatProcessJobs, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatProcessJobs.sessionId],
    references: [chatSessions.id],
  }),
}))

export const chatMessageEmbeddingsRelations = relations(chatMessageEmbeddings, ({ one }) => ({
  session: one(chatSessions, {
    fields: [chatMessageEmbeddings.sessionId],
    references: [chatSessions.id],
  }),
  message: one(chatMessages, {
    fields: [chatMessageEmbeddings.messageId],
    references: [chatMessages.id],
  }),
}))
