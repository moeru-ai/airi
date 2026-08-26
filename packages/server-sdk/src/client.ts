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

export interface ClientHeartbeatOptions {
  message?: MessageHeartbeat | string
  pingInterval?: number
  readTimeout?: number
}

export interface ClientOptions<C = undefined> {
  autoConnect?: boolean
  autoReconnect?: boolean
  configSchema?: ModuleConfigSchema
  connector?: ClientConnector<WebSocketEvent<C>>
  connectTimeoutMs?: number

  dependencies?: ModuleDependency[]
  extension?: ExtensionIdentity
  /**
   * Selects the connection handshake owned by this client.
   *
   * @default 'module'
   */
  handshake?: 'manual' | 'module'
  heartbeat?: ClientHeartbeatOptions | false
  identity?: ExtensionModuleIdentity
  maxReconnectAttempts?: number
  name: string

  onAnyMessage?: (data: WebSocketEvent<C>) => void
  onAnySend?: (data: WebSocketEvent<C>) => void
  onClose?: () => void

  onError?: (error: unknown) => void
  onReady?: () => void
  onStateChange?: (context: ClientStateChangeContext) => void
  possibleEvents?: Array<keyof WebSocketEvents<C>>

  token?: string
  url?: string
}

export interface ClientStateChangeContext {
  previousStatus: ClientStatus
  status: ClientStatus
}

export type ClientStatus
  = | 'announcing'
    | 'authenticating'
    | 'closed'
    | 'closing'
    | 'connecting'
    | 'failed'
    | 'idle'
    | 'ready'
    | 'reconnecting'

export interface ConnectOptions {
  abortSignal?: AbortSignal
  timeout?: number
}

interface NormalizedClientOptions<C> {
  autoConnect: boolean
  autoReconnect: boolean
  configSchema?: ModuleConfigSchema
  connector: ClientConnector<WebSocketEvent<C>>
  connectTimeoutMs: number
  dependencies: ModuleDependency[]
  extension: ExtensionIdentity
  handshake: 'manual' | 'module'
  heartbeat: false | Required<ClientHeartbeatOptions>
  identity: ExtensionModuleIdentity
  maxReconnectAttempts: number
  name: string
  onAnyMessage: (data: WebSocketEvent<C>) => void
  onAnySend: (data: WebSocketEvent<C>) => void
  onClose: () => void
  onError: (error: unknown) => void
  onReady: () => void
  onStateChange: (context: ClientStateChangeContext) => void
  possibleEvents: Array<keyof WebSocketEvents<C>>
  token?: string
  url: string
}

interface ProtocolWaitResult {
  error?: Error
  ready: boolean
}

export class Client<C = undefined> {
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

  private connectTask?: Promise<void>
  private readonly eventListeners = new Map<
    keyof WebSocketEvents<C>,
    Set<(data: WebSocketBaseEvent<string, unknown>) => Promise<void> | void>
  >()

  private failureReason?: Error

  private readonly opts: NormalizedClientOptions<C>

  private readonly stateListeners = new Set<(context: ClientStateChangeContext) => void>()

  private status: ClientStatus = 'idle'

  private readonly transport: BetterWsClient<WebSocketEvent<C>>

  constructor(options: ClientOptions<C>) {
    this.opts = normalizeOptions(options)
    this.transport = createBetterWsClient<WebSocketEvent<C>>({
      connector: this.opts.connector,
      heartbeat: this.createHeartbeatOptions(),
      prepare: context => this.prepareProtocolConnection(context),
      reconnect: this.createReconnectOptions(),
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

  close(code?: number, reason?: string): void {
    this.transport.close(code, reason)
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

  ensureConnected(options?: ConnectOptions) {
    return this.connect(options)
  }

  offEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback?: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => Promise<void> | void,
  ): void {
    const listeners = this.eventListeners.get(event)
    if (!listeners) {
      return
    }

    if (callback) {
      listeners.delete(callback as (data: WebSocketBaseEvent<string, unknown>) => Promise<void> | void)
      if (!listeners.size) {
        this.eventListeners.delete(event)
      }
      return
    }

    this.eventListeners.delete(event)
  }

  onConnectionStateChange(callback: (context: ClientStateChangeContext) => void): () => void {
    this.stateListeners.add(callback)

    return () => {
      this.stateListeners.delete(callback)
    }
  }

  onEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => Promise<void> | void,
  ): () => void {
    let listeners = this.eventListeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(event, listeners)
    }

    listeners.add(callback as (data: WebSocketBaseEvent<string, unknown>) => Promise<void> | void)

    return () => {
      this.offEvent(event, callback)
    }
  }

  ready(options?: ConnectOptions) {
    return this.connect(options)
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

  private consumePrepareMessage(message: WebSocketEvent<C>): ProtocolWaitResult {
    const error = this.errorFromServerEvent(message)
    if (error) {
      this.failureReason = error
      return { error, ready: false }
    }

    if (message.type === 'extension:module:announced') {
      return { ready: this.isSelfModuleAnnouncement(message) }
    }

    if (message.type === 'registry:modules:sync') {
      return { ready: this.hasSelfModuleInRegistrySync(message) }
    }

    return { ready: false }
  }

  private createHeartbeatOptions() {
    if (!this.opts.heartbeat) {
      return false
    }

    return {
      interval: this.opts.heartbeat.pingInterval,
      message: () => this.createPayload({
        data: {
          at: Date.now(),
          kind: MessageHeartbeatKind.Ping,
          message: this.opts.heartbeat ? this.opts.heartbeat.message : MessageHeartbeat.Ping,
        },
        type: 'transport:connection:heartbeat',
      } as WebSocketEventOptionalSource<C>),
      mode: 'message' as const,
      timeout: this.opts.heartbeat.readTimeout,
    }
  }

  private createPayload(data: WebSocketEventOptionalSource<C>) {
    return {
      ...data,
      metadata: {
        ...data.metadata,
        event: {
          ...data.metadata?.event,
          id: data.metadata?.event?.id ?? createEventId(),
        },
        source: data.metadata?.source ?? {
          kind: 'plugin',
          ...this.opts.identity,
          plugin: { id: this.opts.extension.id },
        },
      },
    } as WebSocketEvent<C>
  }

  private createReconnectOptions(): false | ReconnectOptions {
    if (!this.opts.autoReconnect) {
      return false
    }

    return {
      onFailed: (error) => {
        const normalized = this.normalizeError(error, 'Failed to connect websocket client')
        if (this.failureReason === normalized) {
          return
        }

        this.failureReason = normalized
        this.opts.onError(normalized)
      },
      retries: (attempt, error) => {
        const normalized = this.normalizeError(error, 'Failed to connect websocket client')
        if (isTerminalAuthenticationServerErrorMessage(normalized.message)) {
          return false
        }

        return this.opts.maxReconnectAttempts === -1 || attempt <= this.opts.maxReconnectAttempts
      },
    }
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

  private async handleMessage(message: WebSocketEvent<C>): Promise<void> {
    this.opts.onAnyMessage(message)

    const error = this.errorFromServerEvent(message)
    if (error) {
      this.failureReason = error
      this.opts.onError(error)
    }

    if (message.type === 'transport:connection:heartbeat' && message.data.kind === MessageHeartbeatKind.Ping) {
      this.send({
        data: {
          at: Date.now(),
          kind: MessageHeartbeatKind.Pong,
          message: MessageHeartbeat.Pong,
        },
        type: 'transport:connection:heartbeat',
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

  private hasSelfModuleInRegistrySync(event: WebSocketBaseEvent<'registry:modules:sync', WebSocketEvents<C>['registry:modules:sync']>) {
    return event.data.modules.some(module =>
      module.name === this.opts.name
      && module.identity?.id === this.opts.identity.id,
    )
  }

  private isSelfModuleAnnouncement(event: WebSocketBaseEvent<'extension:module:announced', WebSocketEvents<C>['extension:module:announced']>) {
    return event.data.name === this.opts.name && event.data.identity?.id === this.opts.identity.id
  }

  private mapTransportStatus(state: BetterWsClient<WebSocketEvent<C>>['state']): ClientStatus | undefined {
    switch (state) {
      case 'closed':
      case 'closing':
      case 'connecting':
      case 'failed':
      case 'idle':
      case 'reconnecting':
        return state
      case 'open':
      case 'preparing':
      case 'ready':
        return undefined
    }
  }

  private normalizeError(error: unknown, fallback: string): Error {
    return error instanceof Error
      ? error
      : new Error(errorMessageFrom(error) ?? fallback)
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
        data: { token: this.opts.token },
        type: 'module:authenticate',
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
      data: {
        configSchema: this.opts.configSchema,
        dependencies: this.opts.dependencies,
        identity: this.opts.identity,
        name: this.opts.name,
        possibleEvents: this.opts.possibleEvents,
      },
      type: 'extension:module:announce',
    } as WebSocketEventOptionalSource<C>))

    await context.waitFor((message) => {
      const result = this.consumePrepareMessage(message)
      if (result.error) {
        throw result.error
      }

      return result.ready
    }, { timeout: this.opts.connectTimeoutMs })
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
}

export function createClient<C = undefined>(options: ClientOptions<C>): Client<C> {
  return new Client(options)
}

/** Wraps a text websocket connector with AIRI protocol serialization. */
export function createTextProtocolConnector<C = undefined>(
  textConnector: ClientConnector<string>,
): ClientConnector<WebSocketEvent<C>> {
  return {
    async connect(events) {
      const connection = await textConnector.connect({
        close: details => events.close(details),
        error: error => events.error(error),
        message(text) {
          try {
            events.message(parseEvent<C>(text))
          }
          catch (error) {
            events.error(error)
          }
        },
      })

      return {
        close: (code, reason) => connection.close?.(code, reason),
        ping: connection.ping,
        pong: connection.pong,
        send: message => connection.send(stringifyEvent(message)),
      }
    },
  }
}

function createAbortError() {
  return new Error('Connection aborted')
}

function createConnectionTimeoutError(timeout: number) {
  return new Error(`Connection timed out after ${timeout}ms`)
}

function createDefaultProtocolConnector<C>(url: string): ClientConnector<WebSocketEvent<C>> {
  return createTextProtocolConnector(createCrossWsConnector({ url }))
}

function createEventId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createInstanceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function normalizeHeartbeatOptions(heartbeat?: ClientHeartbeatOptions | false): false | Required<ClientHeartbeatOptions> {
  if (heartbeat === false) {
    return false
  }

  const readTimeout = heartbeat?.readTimeout ?? 30_000
  const pingInterval = heartbeat?.pingInterval ?? Math.max(1_000, Math.floor(readTimeout / 2))

  return {
    message: heartbeat?.message ?? MessageHeartbeat.Ping,
    pingInterval: Math.min(pingInterval, readTimeout),
    readTimeout,
  }
}

function normalizeOptions<C>(options: ClientOptions<C>): NormalizedClientOptions<C> {
  const url = options.url ?? 'ws://localhost:6121/ws'
  const extension = options.extension ?? { id: options.name }
  const identity = options.identity ?? {
    extension,
    id: createInstanceId(),
  }

  return {
    autoConnect: options.autoConnect ?? true,
    autoReconnect: options.autoReconnect ?? true,
    configSchema: options.configSchema,
    connector: options.connector ?? createDefaultProtocolConnector<C>(url),
    connectTimeoutMs: options.connectTimeoutMs ?? 15_000,
    dependencies: options.dependencies ?? [],
    extension,
    handshake: options.handshake ?? 'module',
    heartbeat: normalizeHeartbeatOptions(options.heartbeat),
    identity,
    maxReconnectAttempts: options.maxReconnectAttempts ?? -1,
    name: options.name,
    onAnyMessage: options.onAnyMessage ?? (() => {}),
    onAnySend: options.onAnySend ?? (() => {}),
    onClose: options.onClose ?? (() => {}),
    onError: options.onError ?? (() => {}),
    onReady: options.onReady ?? (() => {}),
    onStateChange: options.onStateChange ?? (() => {}),
    possibleEvents: options.possibleEvents ?? [],
    token: options.token,
    url,
  }
}
