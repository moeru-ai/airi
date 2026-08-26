import type { ActionInstruction } from '../action/types'
import type { BotEvent } from '../types'

export interface ActionRuntimeResult {
  action: ActionInstruction
  error?: string
  ok: boolean
  result?: unknown
}

export interface BridgeAvailability {
  botCall: boolean
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

export interface HistorySeed {
  conversationHistory: Array<{ content: string, role: string }>
  currentTurn: number
  llmLogEntries: Array<Record<string, unknown>>
}

export type ParentToWorkerMessage
  = | { error: SerializedWorkerError, ok: false, requestId: number, type: 'bridge-response' }
    | { ok: true, requestId: number, result?: unknown, type: 'bridge-response' }
    | { payload: SandboxWorkerRequest, type: 'evaluate' }

export interface QuerySeed {
  blocks: Array<Record<string, unknown>>
  craftable: string[]
  entities: Array<Record<string, unknown>>
  gaze: unknown[]
  inventory: Array<Record<string, unknown>>
  self: null | Record<string, unknown>
}

export interface RuntimeSnapshot {
  actionQueue: unknown
  currentInput: unknown
  errorBurstGuard: unknown
  event: BotEvent
  historySeed: HistorySeed
  lastAction: ActionRuntimeResult | null
  llmInput: null | undefined | {
    attempt: number
    conversationHistory: unknown[]
    messages: unknown[]
    systemPrompt: string
    updatedAt: number
    userMessage: string
  }
  llmLogEntries: Array<Record<string, unknown>>
  mem: Record<string, unknown>
  noActionBudget: unknown
  prevRun: null | { actions: ActionRuntimeResult[], logs: string[], returnRaw?: unknown }
  querySeed: null | QuerySeed
  snapshot: Record<string, unknown>
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

export interface SandboxWorkerState {
  logs: string[]
  mem: Record<string, unknown>
}

export interface SerializedWorkerError {
  message: string
  name: string
  stack?: string
}

export type WorkerToParentMessage
  = | { args: unknown[], method: string, requestId: number, type: 'bridge-request' }
    | { error: SerializedWorkerError, state?: SandboxWorkerState, type: 'error' }
    | { error: SerializedWorkerError, type: 'catastrophic-error' }
    | { result: SandboxWorkerResult, type: 'result' }
    | { type: 'ready' }

export function createWorkerError(message: string, state?: SandboxWorkerState, cause?: unknown): Error & { state?: SandboxWorkerState } {
  const error = cause instanceof Error ? cause : new Error(message)
  error.message = message
  return Object.assign(error, state ? { state } : {})
}

export function hydrateWorkerError(error: SerializedWorkerError): Error {
  const hydrated = new Error(error.message)
  hydrated.name = error.name
  if (error.stack)
    hydrated.stack = error.stack
  return hydrated
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

function workerErrorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string')
    return error.message
  if (error instanceof Error)
    return error.message
  return String(error)
}

function workerErrorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error && typeof error.name === 'string')
    return error.name
  if (error instanceof Error)
    return error.name
  return 'Error'
}

function workerErrorStack(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'stack' in error && typeof error.stack === 'string')
    return error.stack
  if (error instanceof Error)
    return error.stack
  return undefined
}
