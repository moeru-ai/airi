// Debug server message types for bidirectional WebSocket communication

// ============================================================
// Server -> Client events
// ============================================================

import type { ReflexContextState } from '../cognitive/reflex/context'

import { z } from 'zod'

export interface LogEvent {
  level: 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'
  message: string
  fields?: Record<string, unknown>
  timestamp: number
}

export interface LLMTraceEvent {
  route: string
  messages: unknown[]
  content: string
  reasoning?: string
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  model?: string
  duration?: number // ms
  timestamp: number
}

export interface BrainStateEvent {
  status: 'idle' | 'processing' | 'waiting'
  queueLength: number
  lastContextView?: string
  currentAction?: string
  timestamp: number
}

export interface BlackboardEvent {
  state: Record<string, unknown>
  timestamp: number
}

export interface QueueEvent {
  queue: Array<{
    type: string
    payload: unknown
    source?: { type: string, id: string }
  }>
  processing?: {
    type: string
    payload: unknown
    source?: { type: string, id: string }
  }
  timestamp: number
}

/**
 * Reflex system state update
 */
export interface ReflexStateEvent {
  mode: string
  activeBehaviorId: string | null
  context: ReflexContextState
  timestamp: number
}

/**
 * Traced event from the cognitive event bus
 */
export interface TraceEvent {
  /** Unique event ID */
  id: string
  /** Trace ID (shared by related events) */
  traceId: string
  /** Parent event ID (for event chains) */
  parentId?: string
  /** Event type (e.g., 'raw:sighted:arm_swing') */
  type: string
  /** Event payload */
  payload: unknown
  /** Event timestamp */
  timestamp: number
  /** Source component */
  source: {
    component: string
    id?: string
  }
}

/**
 * Batch of trace events
 */
export interface TraceBatchEvent {
  events: TraceEvent[]
  timestamp: number
}

/**
 * Live conversation state update from the brain
 */
export interface ConversationUpdateEvent {
  messages: Array<{ role: string, content: string, reasoning?: string }>
  isProcessing: boolean
  sessionBoundary?: boolean
  timestamp: number
}

// Union type for all server events

// ============================================================
// Tool types
// ============================================================

export interface ToolParameter {
  name: string
  type: 'string' | 'number' | 'boolean'
  description?: string
  required?: boolean
  min?: number
  max?: number
  default?: unknown
}

export interface ToolDefinition {
  name: string
  description: string
  params: ToolParameter[]
}

export interface ToolExecutionResultEvent {
  toolName: string
  params: Record<string, unknown>
  result?: string
  error?: string
  timestamp: number
}

export interface ReplVariableDescriptor {
  name: string
  kind: 'tool' | 'function' | 'object' | 'number' | 'string' | 'boolean' | 'undefined' | 'null' | 'unknown'
  readonly: boolean
  preview: string
}

export interface ReplStateEvent {
  variables: ReplVariableDescriptor[]
  updatedAt: number
}

export interface ReplExecutionResultEvent {
  source: 'manual' | 'llm'
  code: string
  logs: string[]
  actions: Array<{
    tool: string
    params: Record<string, unknown>
    ok: boolean
    result?: string
    error?: string
  }>
  returnValue?: string
  error?: string
  durationMs: number
  timestamp: number
}

// ============================================================
// Server Events Extension
// ============================================================

// ... (previous events)

export type ServerEvent
  = | { type: 'log', payload: LogEvent }
    | { type: 'llm', payload: LLMTraceEvent }
    | { type: 'blackboard', payload: BlackboardEvent }
    | { type: 'queue', payload: QueueEvent }
    | { type: 'reflex', payload: ReflexStateEvent }
    | { type: 'trace', payload: TraceEvent }
    | { type: 'trace_batch', payload: TraceBatchEvent }
    | { type: 'history', payload: ServerEvent[] }
    | { type: 'pong', payload: { timestamp: number } }
    | { type: 'debug:tools_list', payload: { tools: ToolDefinition[] } }
    | { type: 'debug:tool_result', payload: ToolExecutionResultEvent }
    | { type: 'debug:repl_state', payload: ReplStateEvent }
    | { type: 'debug:repl_result', payload: ReplExecutionResultEvent }
    | { type: 'brain_state', payload: BrainStateEvent }
    | { type: 'conversation_update', payload: ConversationUpdateEvent }

// ============================================================
// Client -> Server commands
// ============================================================

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

const nonEmptyStringSchema = z.string().trim().min(1)
const timestampSchema = z.number().int().nonnegative()

export const jsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.boolean(),
    z.number(),
    z.string(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
)

export const jsonObjectSchema = z.record(z.string(), jsonValueSchema)

export const debugEventCategorySchema = z.enum([
  'perception',
  'feedback',
  'system_alert',
  'world_update',
])

export const debugEventSourceSchema = z.object({
  type: z.enum(['minecraft', 'airi', 'system']),
  id: nonEmptyStringSchema,
}).strict()

export const perceptionSignalTypeSchema = z.enum([
  'chat_message',
  'entity_attention',
  'environmental_anomaly',
  'saliency_high',
  'social_gesture',
  'social_presence',
  'system_message',
])

export const perceptionSignalSchema = z.object({
  type: perceptionSignalTypeSchema,
  description: nonEmptyStringSchema,
  sourceId: nonEmptyStringSchema.optional(),
  confidence: z.number().min(0).max(1).optional(),
  timestamp: timestampSchema,
  metadata: jsonObjectSchema,
}).strict()

export const debugInjectEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('perception'),
    payload: perceptionSignalSchema,
    source: debugEventSourceSchema,
  }).strict(),
  z.object({
    type: z.literal('feedback'),
    payload: jsonObjectSchema,
    source: debugEventSourceSchema,
  }).strict(),
  z.object({
    type: z.literal('system_alert'),
    payload: jsonObjectSchema,
    source: debugEventSourceSchema,
  }).strict(),
])

export const clearLogsCommandSchema = z.object({
  type: z.literal('clear_logs'),
}).strict()

export const setFilterCommandSchema = z.object({
  type: z.literal('set_filter'),
  payload: z.object({
    panel: nonEmptyStringSchema,
    filter: z.string(),
  }).strict(),
}).strict()

export const injectEventCommandSchema = z.object({
  type: z.literal('inject_event'),
  payload: debugInjectEventSchema,
}).strict()

export const pingCommandSchema = z.object({
  type: z.literal('ping'),
  payload: z.object({
    timestamp: timestampSchema,
  }).strict(),
}).strict()

export const requestHistoryCommandSchema = z.object({
  type: z.literal('request_history'),
}).strict()

export const executeToolCommandSchema = z.object({
  type: z.literal('execute_tool'),
  payload: z.object({
    toolName: nonEmptyStringSchema,
    params: jsonObjectSchema,
  }).strict(),
}).strict()

export const requestToolsCommandSchema = z.object({
  type: z.literal('request_tools'),
}).strict()

export const requestReplStateCommandSchema = z.object({
  type: z.literal('request_repl_state'),
}).strict()

export const requestConversationCommandSchema = z.object({
  type: z.literal('request_conversation'),
}).strict()

export const executeReplCommandSchema = z.object({
  type: z.literal('execute_repl'),
  payload: z.object({
    code: z.string(),
  }).strict(),
}).strict()

export const clientCommandSchema = z.discriminatedUnion('type', [
  clearLogsCommandSchema,
  setFilterCommandSchema,
  injectEventCommandSchema,
  pingCommandSchema,
  requestHistoryCommandSchema,
  executeToolCommandSchema,
  requestToolsCommandSchema,
  requestReplStateCommandSchema,
  executeReplCommandSchema,
  requestConversationCommandSchema,
])

export type ClearLogsCommand = z.infer<typeof clearLogsCommandSchema>
export type SetFilterCommand = z.infer<typeof setFilterCommandSchema>
export type InjectEventCommand = z.infer<typeof injectEventCommandSchema>
export type InjectEventInput = z.infer<typeof debugInjectEventSchema>
export type PingCommand = z.infer<typeof pingCommandSchema>
export type RequestHistoryCommand = z.infer<typeof requestHistoryCommandSchema>
export type ExecuteToolCommand = z.infer<typeof executeToolCommandSchema>
export type RequestToolsCommand = z.infer<typeof requestToolsCommandSchema>
export type RequestReplStateCommand = z.infer<typeof requestReplStateCommandSchema>
export type RequestConversationCommand = z.infer<typeof requestConversationCommandSchema>
export type ExecuteReplCommand = z.infer<typeof executeReplCommandSchema>
export type ClientCommand = z.infer<typeof clientCommandSchema>

// ============================================================
// Wire format
// ============================================================

export interface DebugMessage<T = ServerEvent | ClientCommand> {
  id: string
  data: T
  timestamp: number
}

export const debugClientMessageSchema = z.object({
  id: nonEmptyStringSchema,
  data: clientCommandSchema,
  timestamp: timestampSchema,
}).strict()

export type DebugClientMessage = z.infer<typeof debugClientMessageSchema>

export function formatDebugValidationError(error: z.ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : 'root'
      return `${path}: ${issue.message}`
    })
    .join('; ')
}
