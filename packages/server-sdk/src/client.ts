import type {
  MetadataEventSource,
  ModuleConfigSchema,
  ModuleDependency,
  WebSocketBaseEvent,
  WebSocketEvent,
  WebSocketEventOptionalSource,
  WebSocketEvents,
} from '@proj-airi/server-shared/types'

import WebSocket from 'crossws/websocket'
import superjson from 'superjson'

import { errorMessageFrom, sleep } from '@moeru/std'
import { isTerminalAuthenticationServerErrorMessage, parseServerErrorMessage } from '@proj-airi/server-shared'
import { MessageHeartbeat, MessageHeartbeatKind } from '@proj-airi/server-shared/types'

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

  possibleEvents?: Array<keyof WebSocketEvents<C>>
  identity?: MetadataEventSource
  dependencies?: ModuleDependency[]
  configSchema?: ModuleConfigSchema
  heartbeat?: ClientHeartbeatOptions

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

interface ConnectionAttempt {
  announced: boolean
  authenticated: boolean
  promise: Promise<void>
  reject: (error: Error) => void
  resolve: () => void
  socket: WebSocket
}

function createInstanceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createEventId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

function createDeferredPromise() {
  let resolve!: () => void
  let reject!: (error: Error) => void

  const promise = new Promise<void>((innerResolve, innerReject) => {
    resolve = innerResolve
    reject = innerReject
  })

  return { promise, reject, resolve }
}

function normalizeHeartbeatOptions(heartbeat?: ClientHeartbeatOptions): Required<ClientHeartbeatOptions> {
  const readTimeout = heartbeat?.readTimeout ?? 30_000
  const pingInterval = heartbeat?.pingInterval ?? Math.max(1_000, Math.floor(readTimeout / 2))

  return {
    readTimeout,
    pingInterval: Math.min(pingInterval, readTimeout),
    message: heartbeat?.message ?? MessageHeartbeat.Ping,
  }
}

export class Client<C = undefined> {
  private websocket?: WebSocket
  private shouldClose = false
  private connectTask?: Promise<void>
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private lastPingAt = 0
  private lastReadAt = 0
  private reconnectAttempts = 0
  private pendingReconnect = false
  private connectionAttempt?: ConnectionAttempt
  private failureReason?: Error
  private status: ClientStatus = 'idle'
  private readonly identity: MetadataEventSource
  private readonly heartbeat: Required<ClientHeartbeatOptions>

  private readonly opts: Required<Omit<ClientOptions<C>, 'token' | 'heartbeat' | 'configSchema'>> & Pick<ClientOptions<C>, 'token' | 'configSchema'> & {
    heartbeat: Required<ClientHeartbeatOptions>
  }

  private readonly eventListeners = new Map<
    keyof WebSocketEvents<C>,
    Set<(data: WebSocketBaseEvent<any, any>) => void | Promise<void>>
  >()

  private readonly stateListeners = new Set<(context: ClientStateChangeContext) => void>()

  constructor(options: ClientOptions<C>) {
    const identity = options.identity ?? {
      kind: 'plugin',
      plugin: { id: options.name },
      id: createInstanceId(),
    }

    const heartbeat = normalizeHeartbeatOptions(options.heartbeat)

    this.opts = {
      url: 'ws://localhost:6121/ws',
      onAnyMessage: () => {},
      onAnySend: () => {},
      possibleEvents: [],
      dependencies: [],
      onError: () => {},
      onClose: () => {},
      onReady: () => {},
      onStateChange: () => {},
      autoConnect: true,
      autoReconnect: true,
      maxReconnectAttempts: -1,
      ...options,
      heartbeat,
      identity,
    }

    this.identity = identity
    this.heartbeat = heartbeat

    if (this.opts.autoConnect) {
      void this.connect()
    }
  }

  get connectionStatus() {
    return this.status
  }

  get isReady() {
    return this.status === 'ready'
  }

  get isSocketOpen() {
    return this.websocket?.readyState === WebSocket.OPEN
  }

  get lastError() {
    return this.failureReason
  }

  async connect(options?: ConnectOptions) {
    if (this.shouldClose) {
      throw new Error('Client is closed')
    }

    if (this.status === 'ready') {
      return
    }

    if (this.connectTask) {
      return this.waitForConnection(this.connectTask, options)
    }

    this.connectTask = this.runConnectLoop().finally(() => {
      this.connectTask = undefined
    })

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

    listeners.add(callback as any)

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
      listeners.delete(callback as any)
      if (!listeners.size) {
        this.eventListeners.delete(event)
      }
    }
    else {
      this.eventListeners.delete(event)
    }
  }

  send(data: WebSocketEventOptionalSource<C>): boolean {
    if (!this.isSocketOpen || !this.websocket) {
      return false
    }

    const payload = this.createPayload(data)
    this.opts.onAnySend?.(payload)
    this.websocket.send(superjson.stringify(payload))

    return true
  }

  sendOrThrow(data: WebSocketEventOptionalSource<C>): void {
    if (!this.send(data)) {
      throw new Error(`Client is not connected, current status: ${this.status}`)
    }
  }

  sendRaw(data: string | ArrayBufferLike | ArrayBufferView): boolean {
    if (!this.isSocketOpen || !this.websocket) {
      return false
    }

    this.websocket.send(data)
    return true
  }

  close(): void {
    this.shouldClose = true
    this.pendingReconnect = false
    this.transitionTo('closing')
    this.stopHeartbeat()
    this.rejectAttempt(new Error('Client closed'))

    const websocket = this.websocket
    this.websocket = undefined

    if (websocket && websocket.readyState !== WebSocket.CLOSED && websocket.readyState !== WebSocket.CLOSING) {
      websocket.close()
    }

    this.transitionTo('closed')
  }

  private async runConnectLoop() {
    this.pendingReconnect = false

    while (!this.shouldClose) {
      const reconnecting = this.reconnectAttempts > 0
      this.transitionTo(reconnecting ? 'reconnecting' : 'connecting')

      try {
        await this.connectOnce()
        this.reconnectAttempts = 0
        return
      }
      catch (error) {
        const normalizedError = error instanceof Error ? error : new Error(errorMessageFrom(error) ?? 'Failed to connect websocket client')
        this.failureReason = normalizedError
        this.opts.onError?.(normalizedError)

        if (this.shouldClose) {
          throw normalizedError
        }

        if (isTerminalAuthenticationServerErrorMessage(normalizedError.message)) {
          this.transitionTo('failed')
          throw normalizedError
        }

        if (!this.opts.autoReconnect && reconnecting) {
          this.transitionTo('failed')
          throw normalizedError
        }

        if (!this.canRetry()) {
          this.transitionTo('failed')
          throw normalizedError
        }

        const delay = this.getReconnectDelay(this.reconnectAttempts)
        this.reconnectAttempts += 1
        await sleep(delay)
      }
    }

    throw new Error('Client is closed')
  }

  private connectOnce(): Promise<void> {
    const ws = new WebSocket(this.opts.url)
    this.websocket = ws
    this.lastReadAt = Date.now()
    this.lastPingAt = 0

    const deferred = createDeferredPromise()
    const attempt: ConnectionAttempt = {
      announced: false,
      authenticated: !this.opts.token,
      promise: deferred.promise,
      reject: deferred.reject,
      resolve: deferred.resolve,
      socket: ws,
    }

    this.connectionAttempt = attempt

    const isCurrentSocket = () => this.websocket === ws

    ws.onmessage = (event: MessageEvent) => {
      if (!isCurrentSocket()) {
        return
      }

      void this.handleMessage(event)
    }

    ws.onerror = (event: any) => {
      if (!isCurrentSocket()) {
        return
      }

      const error = event?.error instanceof Error ? event.error : new Error('WebSocket error')
      if (this.connectionAttempt) {
        this.handleSocketFailure(error, ws)
      }
      else {
        this.opts.onError?.(error)
        void this.reconnectAfterProtocolError(error)
      }
    }

    ws.onclose = () => {
      if (!isCurrentSocket()) {
        return
      }

      const wasReady = this.status === 'ready'
      this.cleanupSocket(ws)
      this.opts.onClose?.()

      if (this.shouldClose) {
        return
      }

      if (wasReady && this.opts.autoReconnect) {
        this.pendingReconnect = true
        void this.connect()
        return
      }

      this.rejectAttempt(new Error('WebSocket closed'))
    }

    ws.onopen = () => {
      if (!isCurrentSocket()) {
        return
      }

      this.startHeartbeat()

      if (this.opts.token) {
        attempt.authenticated = false
        this.transitionTo('authenticating')
        this.tryAuthenticate()
      }
      else {
        attempt.authenticated = true
        this.transitionTo('announcing')
        this.tryAnnounce()
      }
    }

    return attempt.promise
  }

  private handleSocketFailure(error: Error, socket?: WebSocket) {
    if (socket && this.websocket !== socket) {
      return
    }

    const currentSocket = socket ?? this.websocket
    this.cleanupSocket(socket)

    if (currentSocket && currentSocket.readyState !== WebSocket.CLOSED && currentSocket.readyState !== WebSocket.CLOSING) {
      currentSocket.close()
    }

    this.rejectAttempt(error)
  }

  private cleanupSocket(socket?: WebSocket) {
    if (socket && this.websocket !== socket) {
      return
    }

    this.stopHeartbeat()

    if (!socket || this.websocket === socket) {
      this.websocket = undefined
    }
  }

  private rejectAttempt(error: Error) {
    if (!this.connectionAttempt) {
      return
    }

    const attempt = this.connectionAttempt
    this.connectionAttempt = undefined
    attempt.reject(error)
  }

  private resolveAttempt() {
    if (!this.connectionAttempt) {
      return
    }

    const attempt = this.connectionAttempt
    this.connectionAttempt = undefined
    attempt.resolve()
  }

  private canRetry() {
    return this.opts.maxReconnectAttempts === -1 || this.reconnectAttempts < this.opts.maxReconnectAttempts
  }

  private getReconnectDelay(attempts: number) {
    return Math.min(2 ** attempts * 1_000, 30_000)
  }

  private transitionTo(status: ClientStatus) {
    if (this.status === status) {
      return
    }

    const previousStatus = this.status
    this.status = status
    const context = { previousStatus, status }

    this.opts.onStateChange?.(context)

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
      throw new Error(`Connection timed out after ${timeout}ms`)
    }

    const abortSignal = options?.abortSignal
    if (abortSignal?.aborted) {
      throw new Error('Connection aborted')
    }

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined
    let removeAbortListener: (() => void) | undefined

    try {
      await Promise.race([
        connectPromise,
        new Promise<void>((_, reject) => {
          if (typeof timeout !== 'undefined') {
            timeoutHandle = setTimeout(() => {
              reject(new Error(`Connection timed out after ${timeout}ms`))
            }, timeout)
          }

          if (abortSignal) {
            const onAbort = () => {
              reject(new Error('Connection aborted'))
            }

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

  private tryAnnounce() {
    this.sendOrThrow({
      type: 'module:announce',
      data: {
        name: this.opts.name,
        identity: this.identity,
        possibleEvents: this.opts.possibleEvents,
        dependencies: this.opts.dependencies,
        configSchema: this.opts.configSchema,
      },
    })
  }

  private tryAuthenticate() {
    if (!this.opts.token) {
      return
    }

    this.sendOrThrow({
      type: 'module:authenticate',
      data: { token: this.opts.token },
    })
  }

  private async handleMessage(event: MessageEvent) {
    this.lastReadAt = Date.now()

    try {
      const data = this.parseMessage(event.data as string)
      this.opts.onAnyMessage?.(data)

      await this.handleControlMessage(data)
      await this.dispatchMessage(data)
    }
    catch (error) {
      const normalizedError = error instanceof Error ? error : new Error(errorMessageFrom(error) ?? 'Failed to handle websocket message')
      this.opts.onError?.(normalizedError)

      if (this.connectionAttempt && this.status !== 'ready') {
        this.handleSocketFailure(normalizedError)
      }
    }
  }

  private parseMessage(raw: string): WebSocketEvent<C> {
    try {
      const parsed = superjson.parse<WebSocketEvent<C> | undefined>(raw)
      if (parsed && typeof parsed === 'object' && 'type' in parsed) {
        return parsed
      }
    }
    catch {
      // Try standard JSON next.
    }

    const parsed = JSON.parse(raw) as WebSocketEvent<C>
    if (!parsed || typeof parsed !== 'object' || !('type' in parsed)) {
      throw new Error('Received invalid websocket message')
    }

    return parsed
  }

  private async handleControlMessage(data: WebSocketEvent<C>) {
    switch (data.type) {
      case 'error': {
        const message = data.data?.message
        if (!message || typeof message !== 'string') {
          return
        }

        const parsedServerError = parseServerErrorMessage(message)
        if (parsedServerError.authentication) {
          const error = new Error(message)
          if (parsedServerError.terminal) {
            this.shouldClose = true
            this.handleSocketFailure(error)
            this.transitionTo('failed')
            return
          }

          await this.reconnectAfterProtocolError(error)
          return
        }

        if (parsedServerError.code !== 'unknown') {
          throw new Error(parsedServerError.message)
        }

        throw new Error(message)
      }

      case 'module:authenticated': {
        if (data.data.authenticated) {
          if (!this.connectionAttempt || this.connectionAttempt.authenticated) {
            return
          }

          this.connectionAttempt.authenticated = true
          this.transitionTo('announcing')
          this.tryAnnounce()
          return
        }

        throw new Error('Authentication failed')
      }

      case 'module:announced': {
        if (!this.isSelfAnnouncement(data)) {
          return
        }

        if (this.connectionAttempt) {
          this.connectionAttempt.announced = true
        }

        this.reconnectAttempts = 0
        this.transitionTo('ready')
        this.resolveAttempt()
        this.opts.onReady?.()
        return
      }

      case 'transport:connection:heartbeat': {
        if (data.data.kind === MessageHeartbeatKind.Ping) {
          this.sendHeartbeatPong()
        }
      }
    }
  }

  private isSelfAnnouncement(event: WebSocketBaseEvent<'module:announced', WebSocketEvents<C>['module:announced']>) {
    return event.data.name === this.opts.name && event.data.identity?.id === this.identity.id
  }

  private async dispatchMessage(data: WebSocketEvent<C>) {
    const listeners = this.eventListeners.get(data.type)
    if (!listeners?.size) {
      return
    }

    const results = await Promise.allSettled(
      Array.from(listeners).map(listener => Promise.resolve(listener(data as any))),
    )

    for (const result of results) {
      if (result.status === 'rejected') {
        this.opts.onError?.(result.reason)
      }
    }
  }

  private createPayload(data: WebSocketEventOptionalSource<C>) {
    return {
      ...data,
      metadata: {
        ...data?.metadata,
        source: data?.metadata?.source ?? this.identity,
        event: {
          id: data?.metadata?.event?.id ?? createEventId(),
          ...data?.metadata?.event,
        },
      },
    } as WebSocketEvent<C>
  }

  private startHeartbeat() {
    if (!this.heartbeat.readTimeout || !this.heartbeat.pingInterval) {
      return
    }

    this.stopHeartbeat()
    this.lastReadAt = Date.now()
    this.lastPingAt = 0

    const interval = Math.max(1_000, Math.min(this.heartbeat.pingInterval, Math.floor(this.heartbeat.readTimeout / 2)))
    this.heartbeatTimer = setInterval(() => {
      if (!this.isSocketOpen) {
        return
      }

      const now = Date.now()
      if (now - this.lastReadAt > this.heartbeat.readTimeout) {
        void this.reconnectAfterProtocolError(new Error(`Read timeout after ${this.heartbeat.readTimeout}ms`))
        return
      }

      if (now - this.lastPingAt >= this.heartbeat.pingInterval) {
        this.sendHeartbeatPing()
      }
    }, interval)
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) {
      return
    }

    clearInterval(this.heartbeatTimer)
    this.heartbeatTimer = undefined
  }

  private sendNativeHeartbeat(kind: 'ping' | 'pong') {
    const websocket = this.websocket as WebSocket & {
      ping?: () => void
      pong?: () => void
    }

    if (kind === 'ping') {
      websocket.ping?.()
    }
    else {
      websocket.pong?.()
    }
  }

  private sendHeartbeatPing() {
    this.lastPingAt = Date.now()
    this.send({
      type: 'transport:connection:heartbeat',
      data: {
        kind: MessageHeartbeatKind.Ping,
        message: this.heartbeat.message,
        at: Date.now(),
      },
    })
    this.sendNativeHeartbeat('ping')
  }

  private sendHeartbeatPong() {
    this.send({
      type: 'transport:connection:heartbeat',
      data: {
        kind: MessageHeartbeatKind.Pong,
        message: MessageHeartbeat.Pong,
        at: Date.now(),
      },
    })
    this.sendNativeHeartbeat('pong')
  }

  private async reconnectAfterProtocolError(error: Error) {
    if (this.shouldClose || this.pendingReconnect) {
      return
    }

    this.pendingReconnect = true
    const hadSocket = !!this.websocket

    if (!this.connectionAttempt || this.status === 'ready') {
      this.opts.onError?.(error)
    }

    const websocket = this.websocket
    this.cleanupSocket(websocket)
    this.rejectAttempt(error)

    if (websocket && websocket.readyState !== WebSocket.CLOSED && websocket.readyState !== WebSocket.CLOSING) {
      websocket.close()
    }

    if (hadSocket) {
      this.opts.onClose?.()
    }

    if (!this.opts.autoReconnect) {
      this.transitionTo('failed')
      return
    }

    void this.connect()
  }
}
