import type {
  Client as BetterWsClient,
  ClientConnector,
  PrepareContext,
  ReconnectOptions,
} from '@proj-airi/better-ws'
import type {
  ExtensionIdentity,
  ExtensionModuleIdentity,
  ModuleConfigSchema,
  ModuleDependency,
  WebSocketBaseEvent,
  WebSocketEvent,
  WebSocketEventOptionalSource,
  WebSocketEvents,
} from '@proj-airi/server-shared/types'

import { errorMessageFrom } from '@moeru/std'
import { createClient as createBetterWsClient } from '@proj-airi/better-ws'
import { createCrossWsConnector } from '@proj-airi/better-ws/client/crossws'
import { isTerminalAuthenticationServerErrorMessage, parseServerErrorMessage } from '@proj-airi/server-shared'
import { MessageHeartbeat, MessageHeartbeatKind } from '@proj-airi/server-shared/types'

import { parseEvent, stringifyEvent } from './codec'

export type { ClientConnector, ClientEvents } from '@proj-airi/better-ws'

export type ClientStatus
  = | 'idle'
    | 'connecting'
    | 'authenticating'
    | 'announcing'
    | 'ready'
    | 'reconnecting'
    | 'closing'
    | 'closed'
    | 'failed'

export interface ClientHeartbeatOptions {
  pingInterval?: number
  readTimeout?: number
  message?: MessageHeartbeat | string
}

export interface ClientStateChangeContext {
  previousStatus: ClientStatus
  status: ClientStatus
}

export interface ConnectOptions {
  abortSignal?: AbortSignal
  timeout?: number
}

export interface ClientOptions<C = undefined> {
  url?: string
  name: string
  token?: string
  connector?: ClientConnector<WebSocketEvent<C>>
  /**
   * Selects the connection handshake owned by this client.
   *
   * @default 'module'
   */
  handshake?: 'module' | 'manual'

  connectTimeoutMs?: number
  possibleEvents?: Array<keyof WebSocketEvents<C>>
  extension?: ExtensionIdentity
  identity?: ExtensionModuleIdentity
  dependencies?: ModuleDependency[]
  configSchema?: ModuleConfigSchema
  heartbeat?: false | ClientHeartbeatOptions

  autoConnect?: boolean
  autoReconnect?: boolean
  maxReconnectAttempts?: number

  onError?: (error: unknown) => void
  onClose?: () => void
  onReady?: () => void
  onStateChange?: (context: ClientStateChangeContext) => void

  onAnyMessage?: (data: WebSocketEvent<C>) => void
  onAnySend?: (data: WebSocketEvent<C>) => void
}

interface NormalizedClientOptions<C> {
  url: string
  name: string
  token?: string
  connector: ClientConnector<WebSocketEvent<C>>
  handshake: 'module' | 'manual'
  connectTimeoutMs: number
  possibleEvents: Array<keyof WebSocketEvents<C>>
  extension: ExtensionIdentity
  identity: ExtensionModuleIdentity
  dependencies: ModuleDependency[]
  configSchema?: ModuleConfigSchema
  heartbeat: false | Required<ClientHeartbeatOptions>
  autoConnect: boolean
  autoReconnect: boolean
  maxReconnectAttempts: number
  onError: (error: unknown) => void
  onClose: () => void
  onReady: () => void
  onStateChange: (context: ClientStateChangeContext) => void
  onAnyMessage: (data: WebSocketEvent<C>) => void
  onAnySend: (data: WebSocketEvent<C>) => void
}

interface ProtocolWaitResult {
  ready: boolean
  error?: Error
}

function createInstanceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createEventId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function normalizeHeartbeatOptions(heartbeat?: false | ClientHeartbeatOptions): false | Required<ClientHeartbeatOptions> {
  if (heartbeat === false) {
    return false
  }

  const readTimeout = heartbeat?.readTimeout ?? 30_000
  const pingInterval = heartbeat?.pingInterval ?? Math.max(1_000, Math.floor(readTimeout / 2))

  return {
    readTimeout,
    pingInterval: Math.min(pingInterval, readTimeout),
    message: heartbeat?.message ?? MessageHeartbeat.Ping,
  }
}

/** Wraps a text websocket connector with AIRI protocol serialization. */
export function createTextProtocolConnector<C = undefined>(
  textConnector: ClientConnector<string>,
): ClientConnector<WebSocketEvent<C>> {
  return {
    async connect(events) {
      const connection = await textConnector.connect({
        message(text) {
          try {
            events.message(parseEvent<C>(text))
          }
          catch (error) {
            events.error(error)
          }
        },
        close: details => events.close(details),
        error: error => events.error(error),
      })

      return {
        send: message => connection.send(stringifyEvent(message)),
        close: (code, reason) => connection.close?.(code, reason),
        ping: connection.ping,
        pong: connection.pong,
      }
    },
  }
}

function createDefaultProtocolConnector<C>(url: string): ClientConnector<WebSocketEvent<C>> {
  return createTextProtocolConnector(createCrossWsConnector({ url }))
}

function normalizeOptions<C>(options: ClientOptions<C>): NormalizedClientOptions<C> {
  const url = options.url ?? 'ws://localhost:6121/ws'
  const extension = options.extension ?? { id: options.name }
  const identity = options.identity ?? {
    id: createInstanceId(),
    extension,
  }

  return {
    url,
    name: options.name,
    token: options.token,
    connector: options.connector ?? createDefaultProtocolConnector<C>(url),
    handshake: options.handshake ?? 'module',
    connectTimeoutMs: options.connectTimeoutMs ?? 15_000,
    possibleEvents: options.possibleEvents ?? [],
    extension,
    identity,
    dependencies: options.dependencies ?? [],
    configSchema: options.configSchema,
    heartbeat: normalizeHeartbeatOptions(options.heartbeat),
    autoConnect: options.autoConnect ?? true,
    autoReconnect: options.autoReconnect ?? true,
    maxReconnectAttempts: options.maxReconnectAttempts ?? -1,
    onError: options.onError ?? (() => {}),
    onClose: options.onClose ?? (() => {}),
    onReady: options.onReady ?? (() => {}),
    onStateChange: options.onStateChange ?? (() => {}),
    onAnyMessage: options.onAnyMessage ?? (() => {}),
    onAnySend: options.onAnySend ?? (() => {}),
  }
}

function createConnectionTimeoutError(timeout: number) {
  return new Error(`Connection timed out after ${timeout}ms`)
}

function createAbortError() {
  return new Error('Connection aborted')
}

export class Client<C = undefined> {
  private readonly opts: NormalizedClientOptions<C>
  private readonly transport: BetterWsClient<WebSocketEvent<C>>
  private readonly eventListeners = new Map<
    keyof WebSocketEvents<C>,
    Set<(data: WebSocketBaseEvent<string, unknown>) => void | Promise<void>>
  >()

  private readonly stateListeners = new Set<(context: ClientStateChangeContext) => void>()
  private status: ClientStatus = 'idle'
  private connectTask?: Promise<void>
  private failureReason?: Error

  constructor(options: ClientOptions<C>) {
    this.opts = normalizeOptions(options)
    this.transport = createBetterWsClient<WebSocketEvent<C>>({
      connector: this.opts.connector,
      reconnect: this.createReconnectOptions(),
      heartbeat: this.createHeartbeatOptions(),
      prepare: context => this.prepareProtocolConnection(context),
    })

    this.transport.onMessage(({ message }) => {
      void this.handleMessage(message)
    })
    this.transport.onStateChange(({ previousState, state }) => {
      this.handleTransportStateChange(previousState, state)
    })

    if (this.opts.autoConnect) {
      void this.connect().catch((error) => {
        const normalized = this.normalizeError(error, 'Failed to connect websocket client')
        this.failureReason = normalized
        this.opts.onError(normalized)
      })
    }
  }

  get connectionStatus() {
    return this.status
  }

  get isReady() {
    return this.status === 'ready'
  }

  get isSocketOpen() {
    return this.transport.state === 'open' || this.transport.state === 'preparing' || this.transport.state === 'ready'
  }

  get lastError() {
    return this.failureReason
  }

  async connect(options?: ConnectOptions) {
    if (this.status === 'ready') {
      return
    }

    if (!this.connectTask && this.transport.state === 'reconnecting') {
      return this.waitForConnection(this.waitForReady(), options)
    }

    if (!this.connectTask && (this.transport.state === 'open' || this.transport.state === 'preparing')) {
      return this.waitForConnection(this.waitForReady(), options)
    }

    if (!this.connectTask) {
      this.connectTask = this.transport.connect().finally(() => {
        this.connectTask = undefined
      })
    }

    return this.waitForConnection(this.connectTask, options)
  }

  ready(options?: ConnectOptions) {
    return this.connect(options)
  }

  ensureConnected(options?: ConnectOptions) {
    return this.connect(options)
  }

  onConnectionStateChange(callback: (context: ClientStateChangeContext) => void): () => void {
    this.stateListeners.add(callback)

    return () => {
      this.stateListeners.delete(callback)
    }
  }

  onEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>,
  ): () => void {
    let listeners = this.eventListeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(event, listeners)
    }

    listeners.add(callback as (data: WebSocketBaseEvent<string, unknown>) => void | Promise<void>)

    return () => {
      this.offEvent(event, callback)
    }
  }

  offEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback?: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>,
  ): void {
    const listeners = this.eventListeners.get(event)
    if (!listeners) {
      return
    }

    if (callback) {
      listeners.delete(callback as (data: WebSocketBaseEvent<string, unknown>) => void | Promise<void>)
      if (!listeners.size) {
        this.eventListeners.delete(event)
      }
      return
    }

    this.eventListeners.delete(event)
  }

  send(data: WebSocketEventOptionalSource<C>): boolean {
    const payload = this.createPayload(data)
    const result = this.transport.send(payload)
    if (!result.ok) {
      return false
    }

    this.opts.onAnySend(payload)
    return true
  }

  sendOrThrow(data: WebSocketEventOptionalSource<C>): void {
    if (!this.send(data)) {
      throw new Error(`Client is not connected, current status: ${this.status}`)
    }
  }

  close(code?: number, reason?: string): void {
    this.transport.close(code, reason)
  }

  private createReconnectOptions(): false | ReconnectOptions {
    if (!this.opts.autoReconnect) {
      return false
    }

    return {
      retries: (attempt, error) => {
        const normalized = this.normalizeError(error, 'Failed to connect websocket client')
        if (isTerminalAuthenticationServerErrorMessage(normalized.message)) {
          return false
        }

        return this.opts.maxReconnectAttempts === -1 || attempt <= this.opts.maxReconnectAttempts
      },
      onFailed: (error) => {
        const normalized = this.normalizeError(error, 'Failed to connect websocket client')
        if (this.failureReason === normalized) {
          return
        }

        this.failureReason = normalized
        this.opts.onError(normalized)
      },
    }
  }

  private createHeartbeatOptions() {
    if (!this.opts.heartbeat) {
      return false
    }

    return {
      mode: 'message' as const,
      interval: this.opts.heartbeat.pingInterval,
      timeout: this.opts.heartbeat.readTimeout,
      message: () => this.createPayload({
        type: 'transport:connection:heartbeat',
        data: {
          kind: MessageHeartbeatKind.Ping,
          message: this.opts.heartbeat ? this.opts.heartbeat.message : MessageHeartbeat.Ping,
          at: Date.now(),
        },
      } as WebSocketEventOptionalSource<C>),
    }
  }

  private async prepareProtocolConnection(context: PrepareContext<WebSocketEvent<C>>): Promise<void> {
    if (this.opts.handshake === 'manual') {
      if (!context.reconnecting) {
        return
      }

      this.transitionTo('authenticating')
      await this.waitForManualReconnectHandshake(context)
      return
    }

    if (this.opts.token) {
      this.transitionTo('authenticating')
      context.send(this.createPayload({
        type: 'module:authenticate',
        data: { token: this.opts.token },
      } as WebSocketEventOptionalSource<C>))

      await context.waitFor((message) => {
        const result = this.consumePrepareMessage(message)
        if (result.error) {
          throw result.error
        }

        return message.type === 'module:authenticated' && message.data.authenticated === true
      }, { timeout: this.opts.connectTimeoutMs })
    }

    this.transitionTo('announcing')
    context.send(this.createPayload({
      type: 'extension:module:announce',
      data: {
        name: this.opts.name,
        identity: this.opts.identity,
        possibleEvents: this.opts.possibleEvents,
        configSchema: this.opts.configSchema,
        dependencies: this.opts.dependencies,
      },
    } as WebSocketEventOptionalSource<C>))

    await context.waitFor((message) => {
      const result = this.consumePrepareMessage(message)
      if (result.error) {
        throw result.error
      }

      return result.ready
    }, { timeout: this.opts.connectTimeoutMs })
  }

  private async waitForManualReconnectHandshake(context: PrepareContext<WebSocketEvent<C>>): Promise<void> {
    await context.waitFor((message) => {
      const result = this.consumePrepareMessage(message)
      if (result.error) {
        throw result.error
      }

      return message.type === 'peer:authenticated' && message.data.authenticated === true
    }, { timeout: this.opts.connectTimeoutMs })

    this.transitionTo('announcing')

    await context.waitFor((message) => {
      const result = this.consumePrepareMessage(message)
      if (result.error) {
        throw result.error
      }

      return message.type === 'extension:announced'
        && message.data.identity.id === this.opts.extension.id
    }, { timeout: this.opts.connectTimeoutMs })
  }

  private consumePrepareMessage(message: WebSocketEvent<C>): ProtocolWaitResult {
    const error = this.errorFromServerEvent(message)
    if (error) {
      this.failureReason = error
      return { ready: false, error }
    }

    if (message.type === 'extension:module:announced') {
      return { ready: this.isSelfModuleAnnouncement(message) }
    }

    if (message.type === 'registry:modules:sync') {
      return { ready: this.hasSelfModuleInRegistrySync(message) }
    }

    return { ready: false }
  }

  private async handleMessage(message: WebSocketEvent<C>): Promise<void> {
    this.opts.onAnyMessage(message)

    const error = this.errorFromServerEvent(message)
    if (error) {
      this.failureReason = error
      this.opts.onError(error)
    }

    if (message.type === 'transport:connection:heartbeat' && message.data.kind === MessageHeartbeatKind.Ping) {
      this.send({
        type: 'transport:connection:heartbeat',
        data: {
          kind: MessageHeartbeatKind.Pong,
          message: MessageHeartbeat.Pong,
          at: Date.now(),
        },
      } as WebSocketEventOptionalSource<C>)
    }

    const listeners = this.eventListeners.get(message.type)
    if (!listeners?.size) {
      return
    }

    const results = await Promise.allSettled(
      Array.from(listeners).map(listener => Promise.resolve(listener(message as WebSocketBaseEvent<string, unknown>))),
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        this.failureReason = this.normalizeError(result.reason, 'Client event listener failed')
        this.opts.onError(result.reason)
      }
    }
  }

  private handleTransportStateChange(previousState: BetterWsClient<WebSocketEvent<C>>['state'], state: BetterWsClient<WebSocketEvent<C>>['state']) {
    if (state === 'ready') {
      this.transitionTo('ready')
      this.opts.onReady()
      return
    }

    const nextStatus = this.mapTransportStatus(state)
    if (!nextStatus) {
      return
    }

    this.transitionTo(nextStatus)

    if (previousState === 'ready' && state === 'reconnecting') {
      this.opts.onClose()
    }
    else if (state === 'closed') {
      this.opts.onClose()
    }
  }

  private mapTransportStatus(state: BetterWsClient<WebSocketEvent<C>>['state']): ClientStatus | undefined {
    switch (state) {
      case 'idle':
      case 'connecting':
      case 'reconnecting':
      case 'closing':
      case 'closed':
      case 'failed':
        return state
      case 'open':
      case 'preparing':
      case 'ready':
        return undefined
    }
  }

  private transitionTo(status: ClientStatus) {
    if (this.status === status) {
      return
    }

    const previousStatus = this.status
    this.status = status
    const context = { previousStatus, status }

    this.opts.onStateChange(context)

    for (const listener of this.stateListeners) {
      listener(context)
    }
  }

  private async waitForConnection(connectPromise: Promise<void>, options?: ConnectOptions) {
    if (!options?.timeout && !options?.abortSignal) {
      return connectPromise
    }

    const timeout = options?.timeout
    if (typeof timeout !== 'undefined' && timeout <= 0) {
      throw createConnectionTimeoutError(timeout)
    }

    const abortSignal = options?.abortSignal
    if (abortSignal?.aborted) {
      throw createAbortError()
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    let removeAbortListener: (() => void) | undefined

    try {
      await Promise.race([
        connectPromise,
        new Promise<void>((_, reject) => {
          if (typeof timeout !== 'undefined') {
            timeoutHandle = setTimeout(() => {
              reject(createConnectionTimeoutError(timeout))
            }, timeout)
          }

          if (abortSignal) {
            const onAbort = () => reject(createAbortError())
            abortSignal.addEventListener('abort', onAbort, { once: true })
            removeAbortListener = () => abortSignal.removeEventListener('abort', onAbort)
          }
        }),
      ])
    }
    finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle)
      }

      removeAbortListener?.()
    }
  }

  private waitForReady(): Promise<void> {
    if (this.status === 'ready') {
      return Promise.resolve()
    }

    return new Promise<void>((resolve, reject) => {
      const dispose = this.onConnectionStateChange(({ status }) => {
        if (status === 'ready') {
          dispose()
          resolve()
          return
        }

        if (status === 'failed' || status === 'closed') {
          dispose()
          reject(this.failureReason ?? new Error(`Client connection ended with status: ${status}`))
        }
      })
    })
  }

  private errorFromServerEvent(message: WebSocketEvent<C>): Error | undefined {
    if (message.type !== 'error') {
      return undefined
    }

    const errorMessage = typeof message.data.message === 'string'
      ? message.data.message
      : 'Unknown server error'
    const parsed = parseServerErrorMessage(errorMessage)

    if (parsed.code === 'unknown') {
      return new Error(errorMessage)
    }

    return new Error(parsed.message)
  }

  private normalizeError(error: unknown, fallback: string): Error {
    return error instanceof Error
      ? error
      : new Error(errorMessageFrom(error) ?? fallback)
  }

  private isSelfModuleAnnouncement(event: WebSocketBaseEvent<'extension:module:announced', WebSocketEvents<C>['extension:module:announced']>) {
    return event.data.name === this.opts.name && event.data.identity?.id === this.opts.identity.id
  }

  private hasSelfModuleInRegistrySync(event: WebSocketBaseEvent<'registry:modules:sync', WebSocketEvents<C>['registry:modules:sync']>) {
    return event.data.modules.some(module =>
      module.name === this.opts.name
      && module.identity?.id === this.opts.identity.id,
    )
  }

  private createPayload(data: WebSocketEventOptionalSource<C>) {
    return {
      ...data,
      metadata: {
        ...data.metadata,
        source: data.metadata?.source ?? {
          kind: 'plugin',
          ...this.opts.identity,
          plugin: { id: this.opts.extension.id },
        },
        event: {
          ...data.metadata?.event,
          id: data.metadata?.event?.id ?? createEventId(),
        },
      },
    } as WebSocketEvent<C>
  }
}

export function createClient<C = undefined>(options: ClientOptions<C>): Client<C> {
  return new Client(options)
}
