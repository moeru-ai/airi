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

import { sleep } from '@moeru/std'
import {
  MessageHeartbeat,
  MessageHeartbeatKind,
} from '@proj-airi/server-shared/types'

export interface ClientOptions<C = undefined> {
  url?: string | string[]
  name: string
  possibleEvents?: Array<keyof WebSocketEvents<C>>
  token?: string
  identity?: MetadataEventSource
  dependencies?: ModuleDependency[]
  configSchema?: ModuleConfigSchema
  entrypoints?: {
    default?: string
    electron?: string
    web?: string
    node?: string
    server?: string
  }
  autoApprovePlugin?: boolean
  heartbeat?: {
    readTimeout?: number
    message?: MessageHeartbeat | string
  }
  onPluginApprovalRequest?: (payload: {
    identity: MetadataEventSource
    name: string
    reason?: string
  }) => boolean | Promise<boolean>
  onError?: (error: unknown) => void
  onClose?: () => void
  onConnected?: (url: string) => void
  autoConnect?: boolean
  autoReconnect?: boolean
  maxReconnectAttempts?: number
  onAnyMessage?: (data: WebSocketEvent<C>) => void
  onAnySend?: (data: WebSocketEvent<C>) => void
}

function createInstanceId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function createEventId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

const defaultClientUrls = ['wss://localhost:6121/ws', 'ws://localhost:6121/ws']

export class Client<C = undefined> {
  private connected = false
  private connecting = false
  private websocket?: WebSocket
  private shouldClose = false
  private connectAttempt?: Promise<void>
  private connectTask?: Promise<void>
  private heartbeatTimer?: ReturnType<typeof setInterval>

  private readonly opts: Omit<Required<Omit<ClientOptions<C>, 'token'>>, 'url'> & { url: string } & Pick<ClientOptions<C>, 'token'>

  private readonly identity: MetadataEventSource
  private readonly urls: string[]
  private activeUrlIndex = 0
  private discovered = false
  private approved = false
  private entrypointSelected = false
  private announced = false

  private readonly eventListeners = new Map<
    keyof WebSocketEvents<C>,
    Set<(data: WebSocketBaseEvent<any, any>) => void | Promise<void>>
  >()

  constructor(options: ClientOptions<C>) {
    const { url, ...restOptions } = options
    const normalizedUrls = (
      Array.isArray(url)
        ? url
        : url
          ? [url]
          : [...defaultClientUrls])
      .map(entry => entry.trim())
      .filter(entry => entry.length > 0,
      )

    const urls = normalizedUrls.length > 0
      ? normalizedUrls
      : [...defaultClientUrls]

    const identity = options.identity ?? {
      kind: 'plugin',
      plugin: { id: options.name },
      id: createInstanceId(),
    }

    this.urls = urls

    this.opts = {
      url: urls[0],
      onAnyMessage: () => {},
      onAnySend: () => {},
      possibleEvents: [],
      dependencies: [],
      configSchema: undefined,
      entrypoints: undefined,
      autoApprovePlugin: true,
      onPluginApprovalRequest: undefined,
      onError: () => {},
      onClose: () => {},
      onConnected: () => {},
      autoConnect: true,
      autoReconnect: true,
      maxReconnectAttempts: -1,
      heartbeat: {
        readTimeout: 30_000,
        message: MessageHeartbeat.Ping,
      },
      ...restOptions,
      identity,
    }

    this.identity = identity

    // Authentication listener is registered once only
    this.onEvent('module:authenticated', async (event) => {
      if (event.data.authenticated) {
        this.tryDiscover()
      }
      else {
        await this.retryWithExponentialBackoff(() => this.tryAuthenticate())
      }
    })

    this.onEvent('plugin:approval:request', async (event) => {
      const expectedIdentity = this.identity
      if (event.data.identity.id !== expectedIdentity.id || event.data.identity.plugin?.id !== expectedIdentity.plugin?.id) {
        return
      }

      const approvedByHook = await this.opts.onPluginApprovalRequest?.({
        identity: event.data.identity,
        name: event.data.name,
        reason: event.data.reason,
      })
      const approved = approvedByHook ?? this.opts.autoApprovePlugin

      this.send({
        type: 'plugin:approval:result',
        data: {
          identity: expectedIdentity,
          approved,
          reason: approved ? 'approved by client policy' : 'rejected by client policy',
        },
      })
    })

    this.onEvent('plugin:approval:result', async (event) => {
      const expectedIdentity = this.identity
      if (event.data.identity.id !== expectedIdentity.id || event.data.identity.plugin?.id !== expectedIdentity.plugin?.id) {
        return
      }

      this.approved = event.data.approved
      if (this.approved && this.entrypointSelected) {
        this.tryAnnounce()
      }
    })

    this.onEvent('plugin:entrypoint:select', async (event) => {
      const expectedIdentity = this.identity
      if (event.data.identity.id !== expectedIdentity.id || event.data.identity.plugin?.id !== expectedIdentity.plugin?.id) {
        return
      }

      this.entrypointSelected = true
      if (this.approved) {
        this.tryAnnounce()
      }
    })

    this.onEvent('error', async (event) => {
      if (event.data.message === 'not authenticated') {
        await this._reconnectDueToUnauthorized()
      }
    })

    this.onEvent('transport:connection:heartbeat', (event) => {
      if (event.data.kind === MessageHeartbeatKind.Ping) {
        this.sendHeartbeatPong()
      }
    })

    if (this.opts.autoConnect) {
      void this.connect()
    }
  }

  private async retryWithExponentialBackoff(fn: () => void | Promise<void>) {
    const { maxReconnectAttempts } = this.opts
    let attempts = 0

    // Loop until attempts exceed maxReconnectAttempts, or unlimited if -1
    while (true) {
      if (this.shouldClose) {
        console.warn('Aborting retry: client is closed')
        return
      }

      if (maxReconnectAttempts !== -1 && attempts >= maxReconnectAttempts) {
        console.error(`Maximum retry attempts (${maxReconnectAttempts}) reached`)
        return
      }

      try {
        await fn()
        return
      }
      catch (err) {
        this.opts.onError?.(err)
        if (this.urls.length > 1) {
          this.activeUrlIndex = (this.activeUrlIndex + 1) % this.urls.length
          console.warn(`Attempt ${attempts + 1}: Failed to connect to ${this.urls[this.activeUrlIndex]}, trying next URL`)
        }

        const delay = Math.min(2 ** attempts * 1000, 30_000) // capped exponential backoff
        await sleep(delay)
        attempts++
      }
    }
  }

  private async tryReconnectWithExponentialBackoff() {
    if (this.shouldClose) {
      throw new Error('Client is closed')
    }

    await this.retryWithExponentialBackoff(() => this._connect())
  }

  private _connect(): Promise<void> {
    if (this.shouldClose || this.connected) {
      return Promise.resolve()
    }
    if (this.connecting) {
      return this.connectAttempt ?? Promise.resolve()
    }

    this.connectAttempt = new Promise((resolve, reject) => {
      this.connecting = true
      let settled = false

      const settle = (fn: () => void) => {
        if (settled)
          return

        settled = true
        this.connecting = false
        this.connectAttempt = undefined
        fn()
      }

      const ws = new WebSocket(this.urls[this.activeUrlIndex] ?? this.opts.url)
      this.websocket = ws
      const isCurrentSocket = () => this.websocket === ws

      ws.onmessage = (event: MessageEvent) => {
        if (!isCurrentSocket()) {
          return
        }

        this.handleMessageBound(event)
      }
      ws.onerror = (event: any) => {
        if (!isCurrentSocket()) {
          return
        }

        settle(() => {
          this.websocket = undefined
          this.connected = false

          this.opts.onError?.(event)
          reject(event?.error ?? new Error('WebSocket error'))
        })
      }
      ws.onclose = () => {
        if (!isCurrentSocket()) {
          return
        }

        this.websocket = undefined

        if (!settled && !this.connected) {
          settle(() => {
            reject(new Error('WebSocket closed before open'))
          })
          return
        }

        if (this.connected) {
          this.connected = false
          this.discovered = false
          this.approved = false
          this.entrypointSelected = false
          this.announced = false
          this.stopHeartbeat()
          this.opts.onClose?.()
        }
        if (this.opts.autoReconnect && !this.shouldClose) {
          void this.tryReconnectWithExponentialBackoff()
        }
      }
      ws.onopen = () => {
        if (!isCurrentSocket()) {
          return
        }

        settle(() => {
          this.connected = true
          const connectedUrl = this.urls[this.activeUrlIndex] ?? this.opts.url
          this.opts.onConnected?.(connectedUrl)

          this.startHeartbeat()

          if (this.opts.token)
            this.tryAuthenticate()
          else
            this.tryDiscover()

          resolve()
        })
      }
    })

    return this.connectAttempt
  }

  async connect() {
    if (this.connected) {
      return
    }
    if (this.connectTask) {
      return this.connectTask
    }

    this.connectTask = this.tryReconnectWithExponentialBackoff().finally(() => (this.connectTask = undefined))

    return this.connectTask
  }

  private tryDiscover() {
    if (this.discovered) {
      return
    }

    this.discovered = true
    this.send({
      type: 'plugin:discovered',
      data: {
        name: this.opts.name,
        identity: this.identity,
        entrypoints: this.opts.entrypoints,
      },
    })
  }

  private tryAnnounce() {
    if (this.announced || !this.approved || !this.entrypointSelected) {
      return
    }

    this.announced = true
    this.send({
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
    if (this.opts.token) {
      this.send({
        type: 'module:authenticate',
        data: { token: this.opts.token },
      })
    }
  }

  // bound reference avoids new closure allocation on every connect
  private readonly handleMessageBound = (event: MessageEvent) => {
    void this.handleMessage(event)
  }

  private async handleMessage(event: MessageEvent) {
    try {
      // Try superjson first (used by SDK clients), fall back to plain JSON
      // for external clients that send standard JSON-encoded messages.
      const raw = event.data as string
      const parsed = superjson.parse<WebSocketEvent<C> | undefined>(raw)
      const data = (parsed && typeof parsed === 'object' && 'type' in parsed)
        ? parsed
        : JSON.parse(raw) as WebSocketEvent<C>
      if (!data || typeof data !== 'object' || !('type' in data)) {
        console.warn('Received empty message')
        return
      }

      this.opts.onAnyMessage?.(data)
      const listeners = this.eventListeners.get(data.type)
      if (!listeners?.size) {
        return
      }

      // Execute all listeners concurrently
      const executions: Promise<void>[] = []
      for (const listener of listeners) {
        executions.push(Promise.resolve(listener(data as any)))
      }

      await Promise.allSettled(executions)
    }
    catch (err) {
      console.error('Failed to parse message:', err)
      this.opts.onError?.(err)
    }
  }

  onEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>,
  ): void {
    let listeners = this.eventListeners.get(event)
    if (!listeners) {
      listeners = new Set()
      this.eventListeners.set(event, listeners)
    }
    listeners.add(callback as any)
  }

  offEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback?: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void,
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

  send(data: WebSocketEventOptionalSource<C>): void {
    if (this.websocket && this.connected) {
      const payload = {
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

      this.opts.onAnySend?.(payload)

      this.websocket.send(superjson.stringify(payload))
    }
  }

  sendRaw(data: string | ArrayBufferLike | ArrayBufferView): void {
    if (this.websocket && this.connected) {
      this.websocket.send(data)
    }
  }

  close(): void {
    this.shouldClose = true
    this.stopHeartbeat()
    const websocket = this.websocket
    this.websocket = undefined
    if (websocket) {
      websocket.close()
      this.connected = false
    }
  }

  private startHeartbeat() {
    if (!this.opts.heartbeat?.readTimeout) {
      return
    }

    this.stopHeartbeat()

    const ping = () => this.sendHeartbeatPing()

    ping()
    this.heartbeatTimer = setInterval(ping, this.opts.heartbeat.readTimeout)
  }

  private stopHeartbeat() {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = undefined
    }
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
    this.send({
      type: 'transport:connection:heartbeat',
      data: {
        kind: MessageHeartbeatKind.Ping,
        message: this.opts.heartbeat?.message ?? MessageHeartbeat.Ping,
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

  private async _reconnectDueToUnauthorized() {
    if (this.shouldClose)
      return

    const ws = this.websocket
    this.connected = false
    this.websocket = undefined
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      ws.close()
    }

    this.discovered = false
    this.approved = false
    this.entrypointSelected = false
    this.announced = false

    await this.connect()
  }
}
