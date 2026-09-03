import type { HostDataRecord } from '@proj-airi/plugin-sdk/plugin-host'

import type { StageGameletOrchestration } from '../host'
import type { GameletResponsePayload } from './events'

import { createContext, defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { nanoid } from 'nanoid/non-secure'

import { gameletRequest } from './events'

const defaultRequestTimeoutMs = 30000

/** Current platform view state for the active gamelet. */
export interface GameletViewState {
  bindingId?: string
  payload: HostDataRecord
}

type GameletHandler = (payload: HostDataRecord) => Promise<GameletResponsePayload> | GameletResponsePayload

/**
 * Connects stage gamelet operations to a locally mounted gamelet view.
 *
 * The controller invokes the shared Eventa contract even for a local view.
 * Platform renderers subscribe to view state, then attach a handler after the
 * UI mounts. Requests wait for that handler, which prevents a tool call from
 * racing the first UI render.
 */
export class StageGameletController implements StageGameletOrchestration {
  private readonly context = createContext()
  private readonly handlers = new Map<string, GameletHandler>()
  private readonly listeners = new Set<(state: GameletViewState) => void>()
  private readonly ready = new Map<string, { promise: Promise<void>, resolve: () => void }>()
  private state: GameletViewState = { payload: {} }

  constructor() {
    defineInvokeHandler(this.context, gameletRequest, async (request) => {
      const bindingId = request.bindingId
      const handler = this.handlers.get(bindingId)
      if (!handler) {
        throw new Error(`Gamelet \`${bindingId}\` is not ready.`)
      }
      return await handler(request.payload)
    })
  }

  subscribe(listener: (state: GameletViewState) => void) {
    this.listeners.add(listener)
    listener(this.state)
    return () => this.listeners.delete(listener)
  }

  connect(bindingId: string, handler: GameletHandler) {
    this.handlers.set(bindingId, handler)
    this.getReady(bindingId).resolve()
    return () => {
      if (this.handlers.get(bindingId) === handler) {
        this.handlers.delete(bindingId)
        this.ready.delete(bindingId)
      }
    }
  }

  async open(bindingId: string, payload: HostDataRecord = {}) {
    this.state = { bindingId, payload: structuredClone(payload) }
    this.notify()
  }

  async configure(bindingId: string, payload: HostDataRecord) {
    if (this.state.bindingId !== bindingId) {
      await this.open(bindingId, payload)
      return
    }
    this.state = { bindingId, payload: structuredClone(payload) }
    this.notify()
  }

  async request<TResponse = HostDataRecord>(bindingId: string, payload: HostDataRecord, options?: { timeoutMs?: number }): Promise<TResponse> {
    await this.open(bindingId)
    await this.waitForConnection(bindingId, options?.timeoutMs ?? defaultRequestTimeoutMs)
    const invoke = defineInvoke(this.context, gameletRequest)
    return await invoke({ bindingId, requestId: nanoid(), payload }) as TResponse
  }

  async close(bindingId: string) {
    if (this.state.bindingId !== bindingId) {
      return
    }
    this.state = { payload: {} }
    this.notify()
  }

  async isOpen(bindingId: string) {
    return this.state.bindingId === bindingId
  }

  dispose() {
    this.handlers.clear()
    this.listeners.clear()
    this.context.abort()
  }

  private getReady(bindingId: string) {
    const existing = this.ready.get(bindingId)
    if (existing) {
      return existing
    }
    let resolve: (() => void) | undefined
    const promise = new Promise<void>((nextResolve) => {
      resolve = nextResolve
    })
    const ready = { promise, resolve: () => resolve?.() }
    this.ready.set(bindingId, ready)
    return ready
  }

  private async waitForConnection(bindingId: string, timeoutMs: number) {
    if (this.handlers.has(bindingId)) {
      return
    }
    const signal = AbortSignal.timeout(timeoutMs)
    await Promise.race([
      this.getReady(bindingId).promise,
      new Promise<never>((_, reject) => {
        signal.addEventListener('abort', () => reject(new Error(`Gamelet \`${bindingId}\` did not become ready in ${timeoutMs}ms.`)), { once: true })
      }),
    ])
  }

  private notify() {
    for (const listener of this.listeners) {
      listener(this.state)
    }
  }
}
