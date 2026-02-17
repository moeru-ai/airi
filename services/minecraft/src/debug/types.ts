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
 * Archived context summary for the debug dashboard
 */
export interface ContextBoundaryInfo {
  label: string
  summary: string
  turns: number
  archivedAt: number
}

/**
 * Live conversation state update from the brain
 */
export interface ConversationUpdateEvent {
  messages: Array<{ role: string, content: string, reasoning?: string }>
  isProcessing: boolean
  sessionBoundary?: boolean
  /** Active context boundary state */
  activeContext?: {
    label: string | null
    startTurnId: number
    messageCount: number
  }
  /** Archived context summaries */
  archivedContexts?: ContextBoundaryInfo[]
  /** Index in messages where the active context starts */
  activeContextStartIndex?: number
  /** The [CONTEXT_HISTORY] prefix message content, if any */
  contextHistoryMessage?: string | null
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

export interface RequestReplStateCommand {
  type: 'request_repl_state'
}

export interface RequestConversationCommand {
  type: 'request_conversation'
}

export interface ExecuteReplCommand {
  type: 'execute_repl'
  payload: {
    code: string
  }
}

export type ClientCommand
  = | ClearLogsCommand
    | SetFilterCommand
    | InjectEventCommand
    | PingCommand
    | RequestHistoryCommand
    | ExecuteToolCommand
    | RequestToolsCommand
    | RequestReplStateCommand
    | ExecuteReplCommand
    | RequestConversationCommand

// ============================================================
// Wire format
// ============================================================

export interface DebugMessage<T = ServerEvent | ClientCommand> {
  id: string
  data: T
  timestamp: number
}
