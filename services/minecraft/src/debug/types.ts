// Debug server message types for bidirectional WebSocket communication

// ============================================================
// Server -> Client events
// ============================================================

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

// Union type for all server events
export type ServerEvent
  = | { type: 'log', payload: LogEvent }
    | { type: 'llm', payload: LLMTraceEvent }
    | { type: 'blackboard', payload: BlackboardEvent }
    | { type: 'queue', payload: QueueEvent }
    | { type: 'saliency', payload: SaliencyEvent }
    | { type: 'history', payload: ServerEvent[] }
    | { type: 'pong', payload: { timestamp: number } }

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

// Union type for all client commands
export type ClientCommand
  = | ClearLogsCommand
    | SetFilterCommand
    | InjectEventCommand
    | PingCommand
    | RequestHistoryCommand

// ============================================================
// Wire format
// ============================================================

export interface DebugMessage<T = ServerEvent | ClientCommand> {
  id: string
  data: T
  timestamp: number
}
