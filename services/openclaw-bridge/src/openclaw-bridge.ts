import type { OpenClawGatewayClient } from './openclaw-gateway-client'
import type {
  OpenClawBridgeTaskOptions,
  OpenClawDelegatedTaskRequest,
  OpenClawGatewayRequest,
  OpenClawTaskUpdate,
} from './types'

import { errorMessageFrom } from '@moeru/std'
import { nanoid } from 'nanoid'

import { OpenClawTaskHistoryStore } from './history-store'

export interface OpenClawBridgeOptions {
  gatewayClient: OpenClawGatewayClient
  historyStore?: OpenClawTaskHistoryStore
  now?: () => number
  taskIdFactory?: () => string
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === 'AbortError'
    : typeof error === 'object'
      && error !== null
      && 'name' in error
      && error.name === 'AbortError'
}

export class OpenClawBridge {
  private readonly historyStore: OpenClawTaskHistoryStore
  private readonly listeners = new Set<(update: OpenClawTaskUpdate) => void>()
  private readonly controllers = new Map<string, AbortController>()
  private readonly now: () => number
  private readonly taskIdFactory: () => string

  constructor(private readonly options: OpenClawBridgeOptions) {
    this.historyStore = options.historyStore ?? new OpenClawTaskHistoryStore()
    this.now = options.now ?? (() => Date.now())
    this.taskIdFactory = options.taskIdFactory ?? (() => nanoid())
  }

  onTaskUpdate(listener: (update: OpenClawTaskUpdate) => void): () => void {
    this.listeners.add(listener)

    return () => {
      this.listeners.delete(listener)
    }
  }

  delegateTask(request: OpenClawDelegatedTaskRequest, options: OpenClawBridgeTaskOptions = {}): string {
    const taskId = this.taskIdFactory()
    const timestamp = this.now()

    this.historyStore.createQueuedTask({
      taskId,
      request,
      sourceEventId: options.sourceEventId,
      timestamp,
    })
    this.emitUpdate(taskId)

    const controller = new AbortController()
    this.controllers.set(taskId, controller)

    void this.executeTask(taskId, request, controller)

    return taskId
  }

  cancelTask(taskId: string, reason?: string): boolean {
    const record = this.historyStore.getTask(taskId)
    if (!record || ['completed', 'failed', 'cancelled'].includes(record.status)) {
      return false
    }

    const controller = this.controllers.get(taskId)
    if (controller) {
      controller.abort(new DOMException(reason ?? 'OpenClaw task cancelled', 'AbortError'))
      return true
    }

    this.historyStore.updateTask({
      taskId,
      status: 'cancelled',
      note: reason ?? 'OpenClaw task cancelled',
      timestamp: this.now(),
    })
    this.emitUpdate(taskId)
    return true
  }

  getTask(taskId: string) {
    return this.historyStore.getTask(taskId)
  }

  listTasks() {
    return this.historyStore.listTasks()
  }

  dispose(): void {
    for (const controller of this.controllers.values()) {
      controller.abort(new DOMException('OpenClaw bridge disposed', 'AbortError'))
    }

    this.controllers.clear()
    this.listeners.clear()
  }

  private async executeTask(taskId: string, request: OpenClawDelegatedTaskRequest, controller: AbortController): Promise<void> {
    this.historyStore.updateTask({
      taskId,
      status: 'running',
      note: 'Delegated task sent to OpenClaw.',
      timestamp: this.now(),
    })
    this.emitUpdate(taskId)

    try {
      const result = await this.options.gatewayClient.delegateTask(this.toGatewayRequest(taskId, request), controller.signal)

      this.historyStore.updateTask({
        taskId,
        status: 'completed',
        note: result.summary,
        result,
        timestamp: this.now(),
      })
      this.emitUpdate(taskId)
    }
    catch (error) {
      if (isAbortError(error)) {
        this.historyStore.updateTask({
          taskId,
          status: 'cancelled',
          note: errorMessageFrom(error) ?? 'OpenClaw task cancelled',
          timestamp: this.now(),
        })
        this.emitUpdate(taskId)
        return
      }

      this.historyStore.updateTask({
        taskId,
        status: 'failed',
        note: 'OpenClaw task failed.',
        error: {
          message: errorMessageFrom(error) ?? 'Unknown OpenClaw bridge error',
        },
        timestamp: this.now(),
      })
      this.emitUpdate(taskId)
    }
    finally {
      this.controllers.delete(taskId)
    }
  }

  private emitUpdate(taskId: string): void {
    const update = this.historyStore.toTaskUpdate(taskId)

    for (const listener of this.listeners) {
      listener(update)
    }
  }

  private toGatewayRequest(taskId: string, request: OpenClawDelegatedTaskRequest): OpenClawGatewayRequest {
    return {
      taskId,
      taskText: request.taskText,
      source: request.source,
      userId: request.userId,
      conversationId: request.conversationId,
      context: request.context,
      returnMode: request.returnMode,
      metadata: request.metadata,
    }
  }
}
