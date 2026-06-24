import type {
  MetadataEventSource,
  ModuleConfigSchema,
  ModuleDependency,
  WebSocketBaseEvent,
  WebSocketEvent,
  WebSocketEventOptionalSource,
  WebSocketEvents,
} from '@proj-airi/server-shared/types'

import type {
  WebSocketLike,
  WebSocketLikeConstructor,
  WebSocketMessageEventLike,
  WebSocketErrorEventLike,
} from './websocket-like'

import NativeWebSocket from 'crossws/websocket'
import superjson from 'superjson'

import { errorMessageFrom, sleep } from '@moeru/std'
import { isTerminalAuthenticationServerErrorMessage, parseServerErrorMessage } from '@proj-airi/server-shared'
import { MessageHeartbeat, MessageHeartbeatKind } from '@proj-airi/server-shared/types'

export type ClientStatus =
  | 'idle'
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
  websocketConstructor?: WebSocketLikeConstructor

  connectTimeoutMs?: number
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
  socket: WebSocketLike
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

function extractErrorFromEvent(event: WebSocketErrorEventLike | unknown): Error {
  if (event && typeof event === 'object' && 'error' in event && event.error instanceof Error) {
    return event.error
  }
  return new Error('WebSocket error')
}

function isSocketClosed(socket: WebSocketLike, constructor: WebSocketLikeConstructor): boolean {
  return socket.readyState === constructor.CLOSED || socket.readyState === constructor.CLOSING
}

function closeSocketIfOpen(socket: WebSocketLike | undefined, constructor: WebSocketLikeConstructor): void {
  if (socket && !isSocketClosed(socket, constructor)) {
    socket.close()
  }
}

export class Client<C = undefined> {
  private websocket?: WebSocketLike
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
  private readonly websocketConstructor: WebSocketLikeConstructor

  private readonly opts: Required<
    Omit<ClientOptions<C>, 'token' | 'heartbeat' | 'websocketConstructor' | 'configSchema'>
  > &
    Pick<ClientOptions<C>, 'token' | 'heartbeat' | 'configSchema'>

  private readonly eventListeners = new Map<
    keyof WebSocketEvents<C>,
    Set<(data: WebSocketEvent<C>) => void | Promise<void>>
  >()

  private readonly stateListeners = new Set<(context: ClientStateChangeContext) => void>()

  constructor(options: ClientOptions<C>) {
    const { websocketConstructor, ...clientOptions } = options
    const identity = options.identity ?? {
      kind: 'plugin',
      plugin: { id: options.name },
      id: createInstanceId(),
    }

    const heartbeat = normalizeHeartbeatOptions(options.heartbeat)

    this.opts = {
      url: 'ws://localhost:6121/ws',
      connectTimeoutMs: 15_000,
      onAnyMessage: () => {
        /* noop — handled by crossws */
      },
      onAnySend: () => {
        /* noop — handled by crossws */
      },
      possibleEvents: [],
      dependencies: [],
      configSchema: undefined,
      onError: () => {
        /* noop — errors propagated via reconnect loop */
      },
      onClose: () => {
        /* noop — handled by reconnect loop */
      },
      onReady: () => {
        /* noop — readiness tracked via connectionStatus */
      },
      onStateChange: () => {
        /* noop — state tracked via connectionStatus */
      },
      autoConnect: true,
      autoReconnect: true,
      maxReconnectAttempts: -1,
      ...clientOptions,
      heartbeat,
      identity,
    }

    this.identity = identity
    this.heartbeat = heartbeat
    this.websocketConstructor = websocketConstructor ?? (NativeWebSocket as unknown as WebSocketLikeConstructor)

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
    return this.websocket?.readyState === this.websocketConstructor.OPEN
  }

  get lastError() {
    return this.failureReason
  }

  // implements ServerClient interface (Promise<void>)
  connect(options?: ConnectOptions) {
    if (this.shouldClose) {
      throw new Error('Client is closed')
    }

    if (this.status === 'ready') {
      return
    }

    if (this.connectTask) {
      // eslint-disable-next-line consistent-return
      return this.waitForConnection(this.connectTask, options)
    }

    this.connectTask = this.runConnectLoop().finally(() => {
      this.connectTask = undefined
    })

    // eslint-disable-next-line consistent-return
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

    listeners.add(callback as (data: WebSocketEvent<C>) => void | Promise<void>)

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
      listeners.delete(callback as (data: WebSocketEvent<C>) => void | Promise<void>)
      if (!listeners.size) {
        this.eventListeners.delete(event)
      }
    } else {
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
    closeSocketIfOpen(websocket, this.websocketConstructor)

    this.transitionTo('closed')
  }

  private normalizeConnectionError(error: unknown): Error {
    return error instanceof Error ? error : new Error(errorMessageFrom(error) ?? 'Failed to connect websocket client')
  }

  private shouldAbortReconnect(normalizedError: Error, wasReconnecting: boolean): boolean {
    if (this.shouldClose) {
      return true
    }

    if (isTerminalAuthenticationServerErrorMessage(normalizedError.message)) {
      this.transitionTo('failed')
      return true
    }

    if (!this.opts.autoReconnect && wasReconnecting) {
      this.transitionTo('failed')
      return true
    }

    if (!this.canRetry()) {
      this.transitionTo('failed')
      return true
    }

    return false
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
      } catch (error) {
        const normalizedError = this.normalizeConnectionError(error)
        this.failureReason = normalizedError
        this.opts.onError?.(normalizedError)

        if (this.shouldAbortReconnect(normalizedError, reconnecting)) {
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
    const WebSocketConstructor = this.websocketConstructor
    const ws = new WebSocketConstructor(this.opts.url)
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
    const connectTimeoutMs = this.opts.connectTimeoutMs
    const connectTimer = setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        return
      }

      ws.close()
      deferred.reject(new Error(`Connection timeout after ${connectTimeoutMs}ms`))
    }, connectTimeoutMs)

    const clearConnectTimer = () => {
      clearTimeout(connectTimer)
    }

    ws.onmessage = (event: WebSocketMessageEventLike) => {
      if (!isCurrentSocket()) {
        return
      }

      void this.handleMessage(event)
    }

    ws.onerror = (event: WebSocketErrorEventLike | unknown) => {
      clearConnectTimer()

      if (!isCurrentSocket()) {
        return
      }

      const error = extractErrorFromEvent(event)
      if (this.connectionAttempt) {
        this.handleSocketFailure(error, ws)
      } else {
        this.opts.onError?.(error)
        void this.reconnectAfterProtocolError(error)
      }
    }

    ws.onclose = () => {
      clearConnectTimer()

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
        this.transitionTo('idle')
        void this.connect()
        return
      }

      this.rejectAttempt(new Error('WebSocket closed'))
    }

    ws.onopen = () => {
      clearConnectTimer()

      if (!isCurrentSocket()) {
        return
      }

      this.startHeartbeat()

      if (this.opts.token) {
        attempt.authenticated = false
        this.transitionTo('authenticating')
        this.tryAuthenticate()
      } else {
        attempt.authenticated = true
        this.transitionTo('announcing')
        this.tryAnnounce()
      }
    }

    return attempt.promise
  }

  private handleSocketFailure(error: Error, socket?: WebSocketLike) {
    if (socket && this.websocket !== socket) {
      return
    }

    const currentSocket = socket ?? this.websocket
    this.cleanupSocket(socket)
    closeSocketIfOpen(currentSocket, this.websocketConstructor)
    this.rejectAttempt(error)
  }

  private cleanupSocket(socket?: WebSocketLike) {
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

  // eslint-disable-next-line class-methods-use-this
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

  private createConnectionRacePromise(
    reject: (reason: Error) => void,
    timeout?: number,
    abortSignal?: AbortSignal,
  ): void {
    if (timeout && timeout > 0) {
      const handle = setTimeout(() => {
        reject(new Error(`Connection timed out after ${timeout}ms`))
      }, timeout)
      handle.unref?.()
    }

    if (abortSignal) {
      const onAbort = () => reject(new Error('Connection aborted'))
      abortSignal.addEventListener('abort', onAbort, { once: true })
    }
  }

  private validateConnectionOptions(options?: ConnectOptions): void {
    if (options?.timeout && options.timeout <= 0) {
      throw new Error(`Connection timed out after ${options.timeout}ms`)
    }

    if (options?.abortSignal?.aborted) {
      throw new Error('Connection aborted')
    }
  }

  // eslint-disable-next-line consistent-return
  private async waitForConnection(connectPromise: Promise<void>, options?: ConnectOptions) {
    if (!options?.timeout && !options?.abortSignal) {
      return connectPromise
    }

    this.validateConnectionOptions(options)

    await Promise.race([
      connectPromise,
      new Promise<void>((_, reject) => {
        this.createConnectionRacePromise(reject, options?.timeout, options?.abortSignal)
      }),
    ])
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

  private normalizeMessageError(error: unknown): Error {
    return error instanceof Error ? error : new Error(errorMessageFrom(error) ?? 'Failed to handle websocket message')
  }

  private async handleMessage(event: WebSocketMessageEventLike) {
    this.lastReadAt = Date.now()

    try {
      const data = this.parseMessage(event.data as string)
      this.opts.onAnyMessage?.(data)

      await this.handleControlMessage(data)
      await this.dispatchMessage(data)
    } catch (error) {
      const normalizedError = this.normalizeMessageError(error)
      this.opts.onError?.(normalizedError)

      if (this.connectionAttempt && this.status !== 'ready') {
        this.handleSocketFailure(normalizedError)
      }
    }
  }

  private isValidWebSocketEvent(parsed: unknown): parsed is WebSocketEvent<C> {
    return parsed != null && typeof parsed === 'object' && 'type' in parsed
  }

  // eslint-disable-next-line class-methods-use-this
  private parseMessage(raw: string): WebSocketEvent<C> {
    try {
      const parsed = superjson.parse<WebSocketEvent<C> | undefined>(raw)
      if (this.isValidWebSocketEvent(parsed)) {
        return parsed
      }
    } catch {
      // superjson cannot parse this payload — fall back to JSON.parse below.
    }

    const fallback = JSON.parse(raw) as WebSocketEvent<C>
    if (!this.isValidWebSocketEvent(fallback)) {
      throw new Error('Received invalid websocket message')
    }

    return fallback
  }

  private handleErrorControlMessage(data: WebSocketEvent<C>): void {
    const eventData = data.data as { message?: unknown }
    const message = eventData?.message
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

      void this.reconnectAfterProtocolError(error)
      return
    }

    throw new Error(parsedServerError.code !== 'unknown' ? parsedServerError.message : message)
  }

  private handleAuthenticatedControlMessage(data: WebSocketEvent<C>): void {
    const eventData = data.data as { authenticated?: boolean }
    if (!eventData.authenticated) {
      throw new Error('Authentication failed')
    }

    if (!this.connectionAttempt || this.connectionAttempt.authenticated) {
      return
    }

    this.connectionAttempt.authenticated = true
    this.transitionTo('announcing')
    this.tryAnnounce()
  }

  private completeConnection(): void {
    if (this.connectionAttempt) {
      this.connectionAttempt.announced = true
    }

    this.reconnectAttempts = 0
    this.transitionTo('ready')
    this.resolveAttempt()
    this.opts.onReady?.()
  }

  private handleAnnouncedControlMessage(data: WebSocketEvent<C>): void {
    const announcedEvent = data as WebSocketBaseEvent<'module:announced', WebSocketEvents<C>['module:announced']>
    if (!this.isSelfAnnouncement(announcedEvent) || this.status === 'ready') {
      return
    }

    this.completeConnection()
  }

  private parseSyncModules(data: WebSocketEvent<C>): Array<{ name: string; identity?: { id?: string } }> {
    const syncData = data.data as { modules?: Array<{ name: string; identity?: { id?: string } }> } | unknown
    const rawModules = (syncData as { modules?: Array<{ name: string; identity?: { id?: string } }> })?.modules
    return Array.isArray(rawModules) ? rawModules : []
  }

  private isSelfRegisteredInSync(modules: Array<{ name: string; identity?: { id?: string } }>): boolean {
    return modules.some((m) => m.name === this.opts.name && m.identity?.id === this.identity.id)
  }

  private handleRegistrySyncControlMessage(data: WebSocketEvent<C>): void {
    if (this.status !== 'announcing' || !this.connectionAttempt) {
      return
    }

    const modules = this.parseSyncModules(data)
    if (this.isSelfRegisteredInSync(modules)) {
      this.completeConnection()
    }
  }

  private async handleControlMessage(data: WebSocketEvent<C>) {
    // eslint-disable-next-line default-case
    switch (data.type) {
      case 'error': {
        this.handleErrorControlMessage(data)
        return
      }

      case 'module:authenticated': {
        this.handleAuthenticatedControlMessage(data)
        return
      }

      case 'module:announced': {
        this.handleAnnouncedControlMessage(data)
        return
      }

      case 'registry:modules:sync': {
        this.handleRegistrySyncControlMessage(data)
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

    // Cast is necessary here because the Set stores callbacks from potentially different event types,
    // but we're only calling listeners registered for this specific event type
    const results = await Promise.allSettled(
      Array.from(listeners).map((listener) =>
        Promise.resolve((listener as (data: WebSocketEvent<C>) => void | Promise<void>)(data)),
      ),
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

    const interval = Math.max(1_000, Math.min(this.heartbeat.pingInterval, this.heartbeat.readTimeout / 2))
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
    const websocket = this.websocket as WebSocketLike & {
      ping?: () => void
      pong?: () => void
    }

    if (kind === 'ping') {
      websocket.ping?.()
    } else {
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

  private notifyErrorIfAppropriate(error: Error): void {
    if (!this.connectionAttempt || this.status === 'ready') {
      this.opts.onError?.(error)
    }
  }

  private teardownSocketAfterError(error: Error): void {
    const websocket = this.websocket
    this.cleanupSocket(websocket)
    this.rejectAttempt(error)
    closeSocketIfOpen(websocket, this.websocketConstructor)
  }

  private reconnectAfterProtocolError(error: Error) {
    if (this.shouldClose || this.pendingReconnect) {
      return
    }

    this.pendingReconnect = true
    const hadSocket = Boolean(this.websocket)

    this.notifyErrorIfAppropriate(error)
    this.teardownSocketAfterError(error)

    if (hadSocket) {
      this.opts.onClose?.()
    }

    if (!this.opts.autoReconnect) {
      this.transitionTo('failed')
      return
    }

    this.transitionTo('idle')
    void this.connect()
  }
}
