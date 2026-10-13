import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'

import { nanoid } from '../utils/id'

export const agentTraceSpanKinds = [
  'turn',
  'llm_step',
  'tool',
  'wake_word',
  'voice_input',
  'vad',
  'asr',
  'end_judge',
  'rephrase',
  'speech_turn',
  'tts',
  'playback',
  'streaming_control',
] as const

/** One span that a client IO tracer recorded. The span holds no content. */
export const agentTraceSpan = pgTable('agent_trace_span', {
  id: text('id').primaryKey().$defaultFn(() => nanoid()),
  userId: text('user_id').notNull(), // NOTICE: no foreign key, for the same reason as llm_request_log
  traceId: text('trace_id').notNull(),
  spanId: text('span_id').notNull(),
  parentSpanId: text('parent_span_id'),
  name: text('name').notNull(),
  kind: text('kind', { enum: agentTraceSpanKinds }).notNull(),
  interactionId: text('interaction_id'),
  sessionId: text('session_id'),
  requestId: text('request_id'),
  toolName: text('tool_name'),
  toolCallId: text('tool_call_id'),
  status: text('status', { enum: ['ok', 'error', 'cancelled'] }).notNull(),
  errorType: text('error_type'),
  /** Client clock. Order spans of one client by it, never against server times. */
  startedAt: timestamp('started_at').notNull(),
  durationMs: integer('duration_ms'),
  attributes: jsonb('attributes'),
  appSurface: text('app_surface'),
  appVersion: text('app_version'),
  receivedAt: timestamp('received_at').notNull(),
}, table => [
  uniqueIndex('agent_trace_span_user_trace_span_uidx').on(table.userId, table.traceId, table.spanId),
  index('agent_trace_span_user_interaction_idx').on(table.userId, table.interactionId),
])

/** One row for each agent turn, derived from request logs, request items, and client spans. */
export const agentRun = pgTable('agent_run', {
  userId: text('user_id').notNull(),
  interactionId: text('interaction_id').notNull(),
  sessionId: text('session_id'),
  traceId: text('trace_id'),
  status: text('status', { enum: ['running', 'finished', 'cancelled', 'failed'] }).notNull(),
  startedAt: timestamp('started_at').notNull(),
  endedAt: timestamp('ended_at'),
  llmCalls: integer('llm_calls').notNull(),
  toolCalls: integer('tool_calls').notNull(),
  serverToolCalls: integer('server_tool_calls').notNull(),
  failedTools: integer('failed_tools').notNull(),
  inputTokens: integer('input_tokens'),
  outputTokens: integer('output_tokens'),
  hasClientTrace: boolean('has_client_trace').notNull(),
  updatedAt: timestamp('updated_at').notNull(),
}, table => [
  primaryKey({ columns: [table.userId, table.interactionId] }),
  index('agent_run_started_idx').on(table.startedAt),
  index('agent_run_user_started_idx').on(table.userId, table.startedAt),
  index('agent_run_tool_calls_started_idx').on(table.toolCalls, table.startedAt),
])
