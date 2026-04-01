import type {
  ActionRuntimeResult,
  ParentToWorkerMessage,
  RuntimeSnapshot,
  SandboxWorkerRequest,
  SerializedWorkerError,
  WorkerToParentMessage,
} from './js-planner-sandbox-protocol'

import process from 'node:process'

import { pathToFileURL } from 'node:url'
import { inspect } from 'node:util'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function cloneStructured<T>(value: T): T {
  if (typeof value === 'undefined')
    return value

  try {
    return structuredClone(value)
  }
  catch {
    return JSON.parse(JSON.stringify(value)) as T
  }
}

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

function serializeWorkerError(error: unknown): SerializedWorkerError {
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

function hydrateWorkerError(error: SerializedWorkerError): Error {
  const hydrated = new Error(error.message)
  hydrated.name = error.name
  if (error.stack)
    hydrated.stack = error.stack
  return hydrated
}

function send(message: WorkerToParentMessage): void {
  process.send?.(message)
}

function appendLog(logs: string[], args: unknown[]): string {
  const rendered = args.map(arg => inspect(arg, { depth: 4, breakLength: 120 })).join(' ')
  logs.push(rendered)
  return rendered
}

function serializeBridgeValue(value: unknown): string {
  return JSON.stringify({
    isUndefined: typeof value === 'undefined',
    value,
  })
}

function readMemSnapshot(context: any, timeoutMs: number): Record<string, unknown> {
  try {
    const mem = context.evalSync('mem', { timeout: timeoutMs, copy: true })
    return isRecord(mem) ? cloneStructured(mem) : {}
  }
  catch {
    return {}
  }
}

function setGlobalValue(globalRef: any, name: string, value: unknown, ivm: any): void {
  if (typeof value === 'undefined') {
    globalRef.setSync(name, undefined)
    return
  }

  globalRef.setSync(name, new ivm.ExternalCopy(value).copyInto())
}

function bindDataGlobals(globalRef: any, runtime: RuntimeSnapshot, ivm: any): void {
  const currentRun = {
    actions: [] as ActionRuntimeResult[],
    logs: [] as string[],
    returnRaw: undefined,
  }

  setGlobalValue(globalRef, 'snapshot', runtime.snapshot, ivm)
  setGlobalValue(globalRef, 'event', runtime.event, ivm)
  globalRef.setSync('now', Date.now())
  setGlobalValue(globalRef, 'self', runtime.snapshot.self ?? null, ivm)
  setGlobalValue(globalRef, 'environment', runtime.snapshot.environment ?? null, ivm)
  setGlobalValue(globalRef, 'social', runtime.snapshot.social ?? null, ivm)
  setGlobalValue(globalRef, 'threat', runtime.snapshot.threat ?? null, ivm)
  setGlobalValue(globalRef, 'attention', runtime.snapshot.attention ?? null, ivm)
  setGlobalValue(globalRef, 'autonomy', runtime.snapshot.autonomy ?? null, ivm)
  setGlobalValue(globalRef, 'llmInput', runtime.llmInput ?? null, ivm)
  setGlobalValue(globalRef, 'currentInput', runtime.currentInput, ivm)
  setGlobalValue(globalRef, 'llmLogSeed', runtime.llmLogEntries, ivm)
  setGlobalValue(globalRef, 'historySeed', runtime.historySeed, ivm)
  setGlobalValue(globalRef, 'actionQueue', runtime.actionQueue, ivm)
  setGlobalValue(globalRef, 'noActionBudget', runtime.noActionBudget, ivm)
  setGlobalValue(globalRef, 'errorBurstGuard', runtime.errorBurstGuard, ivm)
  setGlobalValue(globalRef, 'llmMessages', runtime.llmInput?.messages ?? [], ivm)
  globalRef.setSync('llmSystemPrompt', runtime.llmInput?.systemPrompt ?? '')
  globalRef.setSync('llmUserMessage', runtime.llmInput?.userMessage ?? '')
  setGlobalValue(globalRef, 'llmConversationHistory', runtime.llmInput?.conversationHistory ?? [], ivm)
  setGlobalValue(globalRef, 'querySeed', runtime.querySeed, ivm)
  globalRef.setSync('query', undefined)
  globalRef.setSync('llmLog', null)
  globalRef.setSync('history', null)
  globalRef.setSync('patterns', null)
  globalRef.setSync('bot', null)
  globalRef.setSync('mineflayer', null)
  setGlobalValue(globalRef, 'mem', runtime.mem, ivm)
  setGlobalValue(globalRef, 'prevRun', runtime.prevRun, ivm)
  setGlobalValue(globalRef, 'lastRun', currentRun, ivm)
  setGlobalValue(globalRef, 'lastAction', runtime.lastAction, ivm)
}

let nextRequestId = 1
const pendingRequests = new Map<number, { resolve: (value: unknown) => void, reject: (error: Error) => void }>()

async function requestParent(method: string, args: unknown[]): Promise<unknown> {
  const requestId = nextRequestId++
  send({
    type: 'bridge-request',
    requestId,
    method,
    args: cloneStructured(args),
  })

  return await new Promise((resolve, reject) => {
    pendingRequests.set(requestId, { resolve, reject })
  })
}

async function runEvaluation(payload: SandboxWorkerRequest): Promise<void> {
  const isolatedVmEntryPath = process.argv[2]
  if (!isolatedVmEntryPath)
    throw new Error('Sandbox worker missing isolated-vm entry path')

  const ivmModule = await import(pathToFileURL(isolatedVmEntryPath).href)
  const ivm = (ivmModule.default ?? ivmModule) as any
  const logs: string[] = []

  let bridgeRef: any
  let context: any
  let isolate: any
  let returnRaw: unknown

  try {
    isolate = new ivm.Isolate({
      memoryLimit: payload.memoryLimitMb,
      onCatastrophicError: (error: unknown) => {
        send({ type: 'catastrophic-error', error: serializeWorkerError(error) })
      },
    })

    context = isolate.createContextSync()
    const globalRef = context.global

    bridgeRef = new ivm.Reference(async (method: string, args: unknown[]) => {
      return serializeBridgeValue(await requestParent(method, args))
    })

    globalRef.setSync('globalThis', globalRef.derefInto())
    globalRef.setSync('global', globalRef.derefInto())

    bindDataGlobals(globalRef, payload.runtime, ivm)
    globalRef.setSync('__plannerLog', new ivm.Callback((...args: unknown[]) => appendLog(logs, args)))
    globalRef.setSync('__plannerBridge', bridgeRef)
    setGlobalValue(globalRef, '__plannerBridgeAvailability', payload.bridgeAvailability, ivm)
    setGlobalValue(globalRef, '__plannerBootstrapActionNames', payload.toolNames, ivm)

    context.evalSync(payload.bootstrapScript, { timeout: payload.timeoutMs })

    returnRaw = await context.evalClosure(
      `return (async () => {\n${payload.script}\n})()`,
      [],
      {
        timeout: payload.timeoutMs,
        result: { copy: true, promise: true },
      },
    )

    send({
      type: 'result',
      result: {
        logs: cloneStructured(logs),
        mem: readMemSnapshot(context, payload.timeoutMs),
        returnRaw: typeof returnRaw === 'undefined' ? undefined : cloneStructured(returnRaw),
      },
    })
  }
  catch (error) {
    send({
      type: 'error',
      error: serializeWorkerError(error),
      state: {
        logs: cloneStructured(logs),
        mem: context ? readMemSnapshot(context, payload.timeoutMs) : {},
      },
    })
  }
  finally {
    for (const pending of pendingRequests.values())
      pending.reject(new Error('Sandbox worker is shutting down'))

    pendingRequests.clear()
    bridgeRef?.release?.()
    context?.release?.()
    isolate?.dispose?.()
    process.disconnect?.()
  }
}

let hasStarted = false

process.on('message', (message: ParentToWorkerMessage) => {
  if (!message || typeof message !== 'object')
    return

  if (message.type === 'bridge-response') {
    const pending = pendingRequests.get(message.requestId)
    if (!pending)
      return

    pendingRequests.delete(message.requestId)
    if (message.ok)
      pending.resolve(message.result)
    else
      pending.reject(hydrateWorkerError(message.error))
    return
  }

  if (message.type === 'evaluate' && !hasStarted) {
    hasStarted = true
    void runEvaluation(message.payload)
  }
})

process.on('disconnect', () => {
  for (const pending of pendingRequests.values())
    pending.reject(new Error('Sandbox worker lost its parent process'))
  pendingRequests.clear()
})

process.on('uncaughtException', (error) => {
  send({ type: 'error', error: serializeWorkerError(error) })
  process.exitCode = 1
})

process.on('unhandledRejection', (reason) => {
  send({ type: 'error', error: serializeWorkerError(reason) })
  process.exitCode = 1
})

send({ type: 'ready' })
