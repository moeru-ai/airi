export type OpenClawTaskStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type OpenClawTaskReturnMode = 'structured' | 'summary'

export const OPENCLAW_TASK_CONTEXT_LANE = 'openclaw:task'
export const OPENCLAW_RESULT_CONTEXT_LANE = 'openclaw:result'

export interface OpenClawDelegatedTaskContext {
  label: string
  value: string
  metadata?: Record<string, unknown>
}

export interface OpenClawDelegatedTaskRequest {
  taskText: string
  source: string
  userId: string
  conversationId: string
  context: OpenClawDelegatedTaskContext[]
  returnMode: OpenClawTaskReturnMode
  destinations?: string[]
  metadata?: Record<string, unknown>
}

export interface OpenClawTaskResult {
  summary: string
  structuredOutput?: Record<string, unknown>
  rawOutput?: unknown
}

export interface OpenClawTaskError {
  message: string
}

export interface OpenClawTaskStatusEntry {
  status: OpenClawTaskStatus
  timestamp: number
  note?: string
  error?: OpenClawTaskError
}

export interface OpenClawTaskHistoryRecord {
  taskId: string
  request: OpenClawDelegatedTaskRequest
  status: OpenClawTaskStatus
  createdAt: number
  updatedAt: number
  sourceEventId?: string
  statusHistory: OpenClawTaskStatusEntry[]
  result?: OpenClawTaskResult
  error?: OpenClawTaskError
}

export interface OpenClawTaskUpdate {
  taskId: string
  status: OpenClawTaskStatus
  timestamp: number
  request: OpenClawDelegatedTaskRequest
  note?: string
  result?: OpenClawTaskResult
  error?: OpenClawTaskError
  sourceEventId?: string
}

export interface OpenClawTaskCancellationRequest {
  taskId: string
  reason?: string
}

export interface OpenClawSparkCommandMetadata {
  conversationId?: string
  replyDestinations?: string[]
  returnMode?: OpenClawTaskReturnMode
  source?: string
  taskId?: string
  taskText?: string
  userId?: string
}

export interface OpenClawGatewayRequest {
  taskId: string
  taskText: string
  source: string
  userId: string
  conversationId: string
  context: OpenClawDelegatedTaskContext[]
  returnMode: OpenClawTaskReturnMode
  metadata?: Record<string, unknown>
}

export interface OpenClawGatewayClientOptions {
  apiKey?: string
  baseUrl: string
  endpoint?: string
  fetch?: typeof globalThis.fetch
  model: string
  requestTimeoutMs?: number
}

export interface OpenClawBridgeTaskOptions {
  sourceEventId?: string
}
