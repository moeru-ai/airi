import type { WebSocketBaseEvent, WebSocketEvent, WebSocketEvents } from '@proj-airi/server-shared/types'

import WebSocket from 'crossws/websocket'

import { sleep } from '@moeru/std'

export interface ClientOptions<C = undefined> {
  url?: string
  name: string
  possibleEvents?: Array<keyof WebSocketEvents<C>>
  token?: string
  onError?: (error: unknown) => void
  onClose?: () => void
  autoConnect?: boolean
  autoReconnect?: boolean
  maxReconnectAttempts?: number
}

export class Client<C = undefined> {
  private connected = false
  private websocket?: WebSocket
  private shouldClose = false

  private readonly opts: Required<Omit<ClientOptions<C>, 'token'>> & Pick<ClientOptions<C>, 'token'>
  private readonly eventListeners = new Map<
    keyof WebSocketEvents<C>,
    Set<(data: WebSocketBaseEvent<any, any>) => void | Promise<void>>
  >()

  constructor(options: ClientOptions<C>) {
    this.opts = {
      url: 'ws://localhost:6121/ws',
      possibleEvents: [],
      onError: () => {},
      onClose: () => {},
      autoConnect: true,
      autoReconnect: true,
      maxReconnectAttempts: -1,
      ...options,
    }

    // Authentication listener is registered once only
    this.onEvent('module:authenticated', async (event) => {
      if (event.data.authenticated) {
        this.tryAnnounce()
      }
      else {
        await this.retryWithExponentialBackoff(() => this.tryAuthenticate())
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
      return
    }
    await this.retryWithExponentialBackoff(() => this._connect())
  }

  private _connect(): Promise<void> {
    if (this.shouldClose || this.connected) {
      return Promise.resolve()
    }

    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.opts.url)
      this.websocket = ws

      ws.onerror = (event: any) => {
        this.connected = false
        this.opts.onError?.(event)
        reject(event?.error ?? new Error('WebSocket error'))
      }

      ws.onclose = () => {
        if (this.connected) {
          this.connected = false
          this.opts.onClose?.()
        }
        if (this.opts.autoReconnect && !this.shouldClose) {
          void this.tryReconnectWithExponentialBackoff()
        }
      }

      ws.onmessage = this.handleMessageBound

      ws.onopen = () => {
        this.connected = true
        this.opts.token ? this.tryAuthenticate() : this.tryAnnounce()
        resolve()
      }
    })
  }

  async connect() {
    await this.tryReconnectWithExponentialBackoff()
  }

  private tryAnnounce() {
    this.send({
      type: 'module:announce',
      data: {
        name: this.opts.name,
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
      const data = JSON.parse(event.data as string) as WebSocketEvent<C>
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

  send(data: WebSocketEvent<C>): void {
    if (this.websocket && this.connected) {
      this.websocket.send(JSON.stringify(data))
    }
  }

  sendRaw(data: string | ArrayBufferLike | ArrayBufferView): void {
    if (this.websocket && this.connected) {
      this.websocket.send(data)
    }
  }

  close(): void {
    this.shouldClose = true
    if (this.websocket) {
      this.websocket.close()
      this.connected = false
    }
  }
}
