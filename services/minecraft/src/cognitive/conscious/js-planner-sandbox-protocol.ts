import type { ActionInstruction } from '../action/types'
import type { BotEvent } from '../types'

export interface ActionRuntimeResult {
  action: ActionInstruction
  ok: boolean
  result?: unknown
  error?: string
}

export interface QuerySeed {
  blocks: Array<Record<string, unknown>>
  craftable: string[]
  entities: Array<Record<string, unknown>>
  gaze: unknown[]
  inventory: Array<Record<string, unknown>>
  self: Record<string, unknown> | null
}

export interface HistorySeed {
  conversationHistory: Array<{ role: string, content: string }>
  currentTurn: number
  llmLogEntries: Array<Record<string, unknown>>
}

export interface RuntimeSnapshot {
  actionQueue: unknown
  currentInput: unknown
  errorBurstGuard: unknown
  event: BotEvent
  historySeed: HistorySeed
  lastAction: ActionRuntimeResult | null
  llmInput: {
    attempt: number
    conversationHistory: unknown[]
    messages: unknown[]
    systemPrompt: string
    updatedAt: number
    userMessage: string
  } | null | undefined
  llmLogEntries: Array<Record<string, unknown>>
  mem: Record<string, unknown>
  noActionBudget: unknown
  prevRun: { actions: ActionRuntimeResult[], logs: string[], returnRaw?: unknown } | null
  querySeed: QuerySeed | null
  snapshot: Record<string, unknown>
}

export interface BridgeAvailability {
  forgetConversation: boolean
  getNoActionBudget: boolean
  notifyAiri: boolean
  patternFind: boolean
  patternGet: boolean
  patternIds: boolean
  patternList: boolean
  queryBlockAt: boolean
  queryMap: boolean
  setNoActionBudget: boolean
  updateAiriContext: boolean
}

export interface SandboxWorkerRequest {
  bootstrapScript: string
  bridgeAvailability: BridgeAvailability
  memoryLimitMb: number
  runtime: RuntimeSnapshot
  script: string
  timeoutMs: number
  toolNames: string[]
}

export interface SandboxWorkerResult {
  logs: string[]
  mem: Record<string, unknown>
  returnRaw?: unknown
}

export interface SerializedWorkerError {
  message: string
  name: string
  stack?: string
}

export interface SandboxWorkerState {
  logs: string[]
  mem: Record<string, unknown>
}

export type WorkerToParentMessage
  = | { type: 'ready' }
    | { type: 'bridge-request', requestId: number, method: string, args: unknown[] }
    | { type: 'result', result: SandboxWorkerResult }
    | { type: 'error', error: SerializedWorkerError, state?: SandboxWorkerState }
    | { type: 'catastrophic-error', error: SerializedWorkerError }

export type ParentToWorkerMessage
  = | { type: 'evaluate', payload: SandboxWorkerRequest }
    | { type: 'bridge-response', requestId: number, ok: true, result?: unknown }
    | { type: 'bridge-response', requestId: number, ok: false, error: SerializedWorkerError }

function workerErrorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string')
    return error.name
  if (error instanceof Error)
    return error.name
  return 'Error'
}

function workerErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string')
    return error.message
  if (error instanceof Error)
    return error.message
  return String(error)
}

function workerErrorStack(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'stack' in error && typeof error.stack === 'string')
    return error.stack
  if (error instanceof Error)
    return error.stack
  return undefined
}

export function serializeWorkerError(error: unknown): SerializedWorkerError {
  const stack = workerErrorStack(error)
  return stack
    ? {
        message: workerErrorMessage(error),
        name: workerErrorName(error),
        stack,
      }
    : {
        message: workerErrorMessage(error),
        name: workerErrorName(error),
      }
}

export function hydrateWorkerError(error: SerializedWorkerError): Error {
  const hydrated = new Error(error.message)
  hydrated.name = error.name
  if (error.stack)
    hydrated.stack = error.stack
  return hydrated
}

export function createWorkerError(message: string, state?: SandboxWorkerState, cause?: unknown): Error & { state?: SandboxWorkerState } {
  const error = cause instanceof Error ? cause : new Error(message)
  error.message = message
  return Object.assign(error, state ? { state } : {})
}
