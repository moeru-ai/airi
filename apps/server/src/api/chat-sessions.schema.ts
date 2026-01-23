import { createInsertSchema, createSelectSchema } from 'drizzle-valibot'
import { array, object, optional, pipe, string, transform, unknown } from 'valibot'

import * as schema from '../schemas/chat-sessions'

const DateSchema = pipe(
  string(),
  transform(v => new Date(v)),
)

// Base Schemas
export const ChatSessionSchema = createSelectSchema(schema.chatSessions)
export const ChatMessageSchema = createSelectSchema(schema.chatMessages)
export const ChatProcessJobSchema = createSelectSchema(schema.chatProcessJobs)
export const ChatMessageEmbeddingSchema = createSelectSchema(schema.chatMessageEmbeddings)

// Sync Schema
export const SyncChatMessageSchema = createInsertSchema(schema.chatMessages, {
  id: string(),
  sessionId: optional(string()),
  userId: optional(string()),
  createdAt: optional(DateSchema),
  raw: unknown(),
})

export const SyncChatSessionItemSchema = object({
  meta: createInsertSchema(schema.chatSessions, {
    id: string(),
    userId: optional(string()),
    characterId: string(),
    createdAt: optional(DateSchema),
    updatedAt: optional(DateSchema),
  }),
  messages: array(SyncChatMessageSchema),
})

export const SyncChatSessionsSchema = object({
  sessions: array(SyncChatSessionItemSchema),
})

// Query Schemas
export const GetChatSessionsQuerySchema = object({
  updatedAfter: optional(pipe(
    string(),
    transform(v => new Date(v)),
  )),
  characterId: optional(string()),
  limit: optional(pipe(
    string(),
    transform(v => Number.parseInt(v, 10)),
  )),
})
