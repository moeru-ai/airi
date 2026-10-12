import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

/** Derived from the stored request content. The request log remains the source, and these rows can be built again from it. */
export const llmRequestItem = pgTable('llm_request_item', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(), // NOTICE: no foreign key, for the same reason as llm_request_log
  requestId: text('request_id').notNull(),
  sessionId: text('session_id'),
  interactionId: text('interaction_id'),
  direction: text('direction', { enum: ['input', 'output'] }).notNull(),
  position: integer('position').notNull(),
  kind: text('kind', { enum: ['user_message', 'assistant_message', 'tool_call', 'tool_result'] }).notNull(),
  text: text('text'),
  toolName: text('tool_name'),
  toolCallId: text('tool_call_id'),
  truncated: boolean('truncated').notNull().default(false),
  createdAt: timestamp('created_at').notNull(),
}, table => [
  uniqueIndex('llm_request_item_request_position_uidx').on(table.userId, table.requestId, table.direction, table.position),
  index('llm_request_item_user_created_idx').on(table.userId, table.createdAt),
  index('llm_request_item_interaction_idx').on(table.interactionId),
  index('llm_request_item_tool_call_created_idx').on(table.createdAt).where(sql`kind = 'tool_call'`),
])
