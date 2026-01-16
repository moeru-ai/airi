// Debug server message types for bidirectional WebSocket communication

// ============================================================
// Server -> Client events
// ============================================================

import type { ReflexContextState } from '../cognitive/reflex/context'

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
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  model?: string
  duration?: number // ms
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

export interface SaliencyEvent {
  slot: number
  counters: Array<{
    key: string
    total: number
    window: number[]
    triggers: number[]
    lastFireSlot: number | null
    lastFireTotal: number
  }>
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
 * Traced event from the Cognitive OS EventBus
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

// ============================================================
// Server Events Extension
// ============================================================

// ... (previous events)

export type ServerEvent
  = | { type: 'log', payload: LogEvent }
    | { type: 'llm', payload: LLMTraceEvent }
    | { type: 'blackboard', payload: BlackboardEvent }
    | { type: 'queue', payload: QueueEvent }
    | { type: 'saliency', payload: SaliencyEvent }
    | { type: 'reflex', payload: ReflexStateEvent }
    | { type: 'trace', payload: TraceEvent }
    | { type: 'trace_batch', payload: TraceBatchEvent }
    | { type: 'history', payload: ServerEvent[] }
    | { type: 'pong', payload: { timestamp: number } }
    | { type: 'debug:tools_list', payload: { tools: ToolDefinition[] } }
    | { type: 'debug:tool_result', payload: ToolExecutionResultEvent }

// ============================================================
// Client -> Server commands
// ============================================================

export interface ClearLogsCommand {
  type: 'clear_logs'
}

export interface SetFilterCommand {
  type: 'set_filter'
  payload: {
    panel: string
    filter: string
  }
}

export interface InjectEventCommand {
  type: 'inject_event'
  payload: {
    eventType: string
    data: unknown
  }
}

export interface PingCommand {
  type: 'ping'
  payload: { timestamp: number }
}

export interface RequestHistoryCommand {
  type: 'request_history'
}

// ============================================================
// Client Commands Extension
// ============================================================

export interface ExecuteToolCommand {
  type: 'execute_tool'
  payload: {
    toolName: string
    params: Record<string, unknown>
  }
}

export interface RequestToolsCommand {
  type: 'request_tools'
}

export type ClientCommand
  = | ClearLogsCommand
    | SetFilterCommand
    | InjectEventCommand
    | PingCommand
    | RequestHistoryCommand
    | ExecuteToolCommand
    | RequestToolsCommand

// ============================================================
// Wire format
// ============================================================

export interface DebugMessage<T = ServerEvent | ClientCommand> {
  id: string
  data: T
  timestamp: number
}
