import type {
  MetadataEventSource,
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
  url?: string
  name: string
  possibleEvents?: Array<keyof WebSocketEvents<C>>
  token?: string
  identity?: MetadataEventSource
  heartbeat?: {
    readTimeout?: number
    message?: MessageHeartbeat | string
  }
  onError?: (error: unknown) => void
  onClose?: () => void
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

export class Client<C = undefined> {
  private connected = false
  private connecting = false
  private websocket?: WebSocket
  private shouldClose = false
  private connectAttempt?: Promise<void>
  private connectTask?: Promise<void>
  private heartbeatTimer?: ReturnType<typeof setInterval>
  private readonly identity: MetadataEventSource

  private readonly opts: Required<Omit<ClientOptions<C>, 'token'>> & Pick<ClientOptions<C>, 'token'>
  private readonly eventListeners = new Map<
    keyof WebSocketEvents<C>,
    Set<(data: WebSocketBaseEvent<any, any>) => void | Promise<void>>
  >()

  constructor(options: ClientOptions<C>) {
    const identity = options.identity ?? {
      plugin: options.name,
      instanceId: createInstanceId(),
    }

    this.opts = {
      url: 'ws://localhost:6121/ws',
      onAnyMessage: () => {},
      onAnySend: () => {},
      possibleEvents: [],
      onError: () => {},
      onClose: () => {},
      autoConnect: true,
      autoReconnect: true,
      maxReconnectAttempts: -1,
      heartbeat: {
        readTimeout: 30_000,
        message: MessageHeartbeat.Ping,
      },
      ...options,
      identity,
    }

    this.identity = identity

    // Authentication listener is registered once only
    this.onEvent('module:authenticated', async (event) => {
      if (event.data.authenticated) {
        this.tryAnnounce()
      }
      else {
        await this.retryWithExponentialBackoff(() => this.tryAuthenticate())
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

      const ws = new WebSocket(this.opts.url)
      this.websocket = ws

      ws.onmessage = this.handleMessageBound
      ws.onerror = (event: any) => {
        settle(() => {
          this.connected = false

          this.opts.onError?.(event)
          reject(event?.error ?? new Error('WebSocket error'))
        })
      }
      ws.onclose = () => {
        if (!settled && !this.connected) {
          settle(() => {
            reject(new Error('WebSocket closed before open'))
          })
          return
        }

        if (this.connected) {
          this.connected = false
          this.stopHeartbeat()
          this.opts.onClose?.()
        }
        if (this.opts.autoReconnect && !this.shouldClose) {
          void this.tryReconnectWithExponentialBackoff()
        }
      }
      ws.onopen = () => {
        settle(() => {
          this.connected = true

          this.startHeartbeat()

          if (this.opts.token)
            this.tryAuthenticate()
          else
            this.tryAnnounce()

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

  private tryAnnounce() {
    this.send({
      type: 'module:announce',
      data: {
        name: this.opts.name,
        identity: this.identity,
        possibleEvents: this.opts.possibleEvents,
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
      const data = superjson.parse<WebSocketEvent<C> | undefined>(event.data as string)
      if (!data) {
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
    if (this.websocket) {
      this.websocket.close()
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
    if (ws && ws.readyState !== WebSocket.CLOSED && ws.readyState !== WebSocket.CLOSING) {
      ws.close()
    }

    await this.connect()
  }
}
