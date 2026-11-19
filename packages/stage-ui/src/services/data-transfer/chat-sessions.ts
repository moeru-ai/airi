import type { DataExportAdapter, DataImportAdapter } from '../../libs/data-transfer'
import type { ChatSessionsExport } from '../../types/chat-session'

import * as v from 'valibot'

import { decodeJsonFile } from '../../libs/data-transfer'
import { useChatSessionStore } from '../../stores/chat/session-store'

const chatSessionsFormat = 'chat-sessions-index:v1'

const chatSessionMetaSchema = v.looseObject({
  sessionId: v.string(),
  userId: v.string(),
  characterId: v.string(),
  createdAt: v.number(),
  updatedAt: v.number(),
})

const chatMessageContentSchema = v.union([
  v.string(),
  v.array(v.looseObject({ type: v.string() })),
])

const chatMessageSchema = v.union([
  v.looseObject({ role: v.literal('assistant'), content: v.optional(chatMessageContentSchema) }),
  v.looseObject({ role: v.literal('system'), content: chatMessageContentSchema }),
  v.looseObject({ role: v.literal('tool'), content: chatMessageContentSchema, tool_call_id: v.string() }),
  v.looseObject({ role: v.literal('user'), content: chatMessageContentSchema }),
  v.looseObject({ role: v.literal('error'), content: v.string() }),
])

const chatSessionsSchema = v.strictObject({
  format: v.literal(chatSessionsFormat),
  index: v.strictObject({
    userId: v.string(),
    characters: v.record(v.string(), v.strictObject({
      activeSessionId: v.string(),
      sessions: v.record(v.string(), chatSessionMetaSchema),
    })),
  }),
  sessions: v.record(v.string(), v.strictObject({
    meta: chatSessionMetaSchema,
    messages: v.array(chatMessageSchema),
  })),
})

/** Creates an adapter for the existing chat session export format. */
export function createChatSessionsExportAdapter(): DataExportAdapter<ChatSessionsExport> {
  const store = useChatSessionStore()

  return {
    read: async () => await store.exportSessions(),
    encode: async value => new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  }
}

/** Creates an adapter that validates chat session files before importing them. */
export function createChatSessionsImportAdapter(
  afterImport?: (value: ChatSessionsExport) => Promise<void>,
): DataImportAdapter<ChatSessionsExport> {
  const store = useChatSessionStore()

  return {
    decode: decodeJsonFile,
    validate: async value => v.parse(chatSessionsSchema, value) as ChatSessionsExport,
    apply: async (value) => {
      await store.importSessions(value)
      await afterImport?.(value)
    },
  }
}
