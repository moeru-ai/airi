// Debug server message types for bidirectional WebSocket communication

// ============================================================
// Server -> Client events
// ============================================================

import type { ReflexContextState } from '../cognitive/reflex/context'

import { z } from 'zod'

export interface BlackboardEvent {
  state: Record<string, unknown>
  timestamp: number
}

export interface BrainStateEvent {
  currentAction?: string
  lastContextView?: string
  queueLength: number
  status: 'idle' | 'processing' | 'waiting'
  timestamp: number
}

/**
 * Live conversation state update from the brain
 */
export interface ConversationUpdateEvent {
  isProcessing: boolean
  messages: Array<{ content: string, reasoning?: string, role: string }>
  sessionBoundary?: boolean
  timestamp: number
}

export interface LLMTraceEvent {
  content: string
  duration?: number // ms
  messages: unknown[]
  model?: string
  reasoning?: string
  route: string
  timestamp: number
  usage?: {
    completion_tokens?: number
    prompt_tokens?: number
    total_tokens?: number
  }
}

export interface LogEvent {
  fields?: Record<string, unknown>
  level: 'DEBUG' | 'ERROR' | 'INFO' | 'WARN'
  message: string
  timestamp: number
}

export interface QueueEvent {
  processing?: {
    payload: unknown
    source?: { id: string, type: string }
    type: string
  }
  queue: Array<{
    payload: unknown
    source?: { id: string, type: string }
    type: string
  }>
  timestamp: number
}

/**
 * Reflex system state update
 */
export interface ReflexStateEvent {
  activeBehaviorId: null | string
  context: ReflexContextState
  mode: string
  timestamp: number
}

export interface ReplExecutionResultEvent {
  actions: Array<{
    error?: string
    ok: boolean
    params: Record<string, unknown>
    result?: string
    tool: string
  }>
  code: string
  durationMs: number
  error?: string
  logs: string[]
  returnValue?: string
  source: 'llm' | 'manual'
  timestamp: number
}

export interface ReplStateEvent {
  updatedAt: number
  variables: ReplVariableDescriptor[]
}

// Union type for all server events

// ============================================================
// Tool types
// ============================================================

export interface ReplVariableDescriptor {
  kind: 'boolean' | 'function' | 'null' | 'number' | 'object' | 'string' | 'tool' | 'undefined' | 'unknown'
  name: string
  preview: string
  readonly: boolean
}

export type ServerEvent
  = | { payload: BlackboardEvent, type: 'blackboard' }
    | { payload: BrainStateEvent, type: 'brain_state' }
    | { payload: ConversationUpdateEvent, type: 'conversation_update' }
    | { payload: LLMTraceEvent, type: 'llm' }
    | { payload: LogEvent, type: 'log' }
    | { payload: QueueEvent, type: 'queue' }
    | { payload: ReflexStateEvent, type: 'reflex' }
    | { payload: ReplExecutionResultEvent, type: 'debug:repl_result' }
    | { payload: ReplStateEvent, type: 'debug:repl_state' }
    | { payload: ServerEvent[], type: 'history' }
    | { payload: ToolExecutionResultEvent, type: 'debug:tool_result' }
    | { payload: TraceBatchEvent, type: 'trace_batch' }
    | { payload: TraceEvent, type: 'trace' }
    | { payload: { timestamp: number }, type: 'pong' }
    | { payload: { tools: ToolDefinition[] }, type: 'debug:tools_list' }

export interface ToolDefinition {
  description: string
  name: string
  params: ToolParameter[]
}

export interface ToolExecutionResultEvent {
  error?: string
  params: Record<string, unknown>
  result?: string
  timestamp: number
  toolName: string
}

export interface ToolParameter {
  default?: unknown
  description?: string
  max?: number
  min?: number
  name: string
  required?: boolean
  type: 'boolean' | 'number' | 'string'
}

/**
 * Batch of trace events
 */
export interface TraceBatchEvent {
  events: TraceEvent[]
  timestamp: number
}

// ============================================================
// Server Events Extension
// ============================================================

// ... (previous events)

/**
 * Traced event from the cognitive event bus
 */
export interface TraceEvent {
  /** Unique event ID */
  id: string
  /** Parent event ID (for event chains) */
  parentId?: string
  /** Event payload */
  payload: unknown
  /** Source component */
  source: {
    component: string
    id?: string
  }
  /** Event timestamp */
  timestamp: number
  /** Trace ID (shared by related events) */
  traceId: string
  /** Event type (e.g., 'raw:sighted:arm_swing') */
  type: string
}

// ============================================================
// Client -> Server commands
// ============================================================

type JsonValue = boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue }

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
  id: nonEmptyStringSchema,
  type: z.enum(['minecraft', 'airi', 'system']),
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
  confidence: z.number().min(0).max(1).optional(),
  description: nonEmptyStringSchema,
  metadata: jsonObjectSchema,
  sourceId: nonEmptyStringSchema.optional(),
  timestamp: timestampSchema,
  type: perceptionSignalTypeSchema,
}).strict()

export const debugInjectEventSchema = z.discriminatedUnion('type', [
  z.object({
    payload: perceptionSignalSchema,
    source: debugEventSourceSchema,
    type: z.literal('perception'),
  }).strict(),
  z.object({
    payload: jsonObjectSchema,
    source: debugEventSourceSchema,
    type: z.literal('feedback'),
  }).strict(),
  z.object({
    payload: jsonObjectSchema,
    source: debugEventSourceSchema,
    type: z.literal('system_alert'),
  }).strict(),
])

export const clearLogsCommandSchema = z.object({
  type: z.literal('clear_logs'),
}).strict()

export const setFilterCommandSchema = z.object({
  payload: z.object({
    filter: z.string(),
    panel: nonEmptyStringSchema,
  }).strict(),
  type: z.literal('set_filter'),
}).strict()

export const injectEventCommandSchema = z.object({
  payload: debugInjectEventSchema,
  type: z.literal('inject_event'),
}).strict()

export const pingCommandSchema = z.object({
  payload: z.object({
    timestamp: timestampSchema,
  }).strict(),
  type: z.literal('ping'),
}).strict()

export const requestHistoryCommandSchema = z.object({
  type: z.literal('request_history'),
}).strict()

export const executeToolCommandSchema = z.object({
  payload: z.object({
    params: jsonObjectSchema,
    toolName: nonEmptyStringSchema,
  }).strict(),
  type: z.literal('execute_tool'),
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
  payload: z.object({
    code: z.string(),
  }).strict(),
  type: z.literal('execute_repl'),
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
export type ClientCommand = z.infer<typeof clientCommandSchema>
export interface DebugMessage<T = ClientCommand | ServerEvent> {
  data: T
  id: string
  timestamp: number
}
export type ExecuteReplCommand = z.infer<typeof executeReplCommandSchema>
export type ExecuteToolCommand = z.infer<typeof executeToolCommandSchema>
export type InjectEventCommand = z.infer<typeof injectEventCommandSchema>
export type InjectEventInput = z.infer<typeof debugInjectEventSchema>
export type PingCommand = z.infer<typeof pingCommandSchema>
export type RequestConversationCommand = z.infer<typeof requestConversationCommandSchema>
export type RequestHistoryCommand = z.infer<typeof requestHistoryCommandSchema>
export type RequestReplStateCommand = z.infer<typeof requestReplStateCommandSchema>
export type RequestToolsCommand = z.infer<typeof requestToolsCommandSchema>

// ============================================================
// Wire format
// ============================================================

export type SetFilterCommand = z.infer<typeof setFilterCommandSchema>

export const debugClientMessageSchema = z.object({
  data: clientCommandSchema,
  id: nonEmptyStringSchema,
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
