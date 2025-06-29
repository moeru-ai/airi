import type { WebSocketBaseEvent, WebSocketEvent, WebSocketEvents } from '@proj-airi/server-shared/types'

import WebSocket from 'crossws/websocket'

import { sleep } from '@moeru/std'

export interface ClientOptions<C = undefined> {
  url?: string
  name: string
  possibleEvents?: Array<(keyof WebSocketEvents<C>)>
  token?: string
  onError?: (error: unknown) => void
  onClose?: () => void
  autoConnect?: boolean
  autoReconnect?: boolean
}

export class Client<C = undefined> {
  private connected = false
  private opts: Required<Omit<ClientOptions<C>, 'token'>> & Pick<ClientOptions<C>, 'token'>
  private websocket: WebSocket | undefined
  private eventListeners: Map<keyof WebSocketEvents<C>, Array<(data: WebSocketBaseEvent<any, any>) => void | Promise<void>>> = new Map()

  private reconnectAttempts = 0
  private shouldClose = false

  constructor(options: ClientOptions<C>) {
    this.opts = {
      url: 'ws://localhost:6121/ws',
      possibleEvents: [],
      onError: () => { },
      onClose: () => { },
      autoConnect: true,
      autoReconnect: true,
      ...options,
    }

    if (this.opts.autoConnect) {
      try {
        this.connect()
      }
      catch (err) {
        console.error(err)
      }
    }
  }

  async retryWithExponentialBackoff(fn: () => void | Promise<void>, attempts = 0, maxAttempts = -1) {
    if (maxAttempts !== -1 && attempts >= maxAttempts) {
      console.error(`Maximum retry attempts (${maxAttempts}) reached`)
      return
    }

    try {
      await fn()
    }
    catch (err) {
      console.error('Encountered an error when retrying', err)
      await sleep(2 ** attempts * 1000)
      await this.retryWithExponentialBackoff(fn, attempts + 1, maxAttempts)
    }
  }

  async tryReconnectWithExponentialBackoff() {
    await this.retryWithExponentialBackoff(() => this._connect(), this.reconnectAttempts)
  }

  private _connect() {
    return new Promise<void>((resolve, reject) => {
      if (this.shouldClose) {
        resolve()
        return
      }

      if (this.connected) {
        resolve()
        return
      }

      this.websocket = new WebSocket(this.opts.url)

      this.onEvent('module:authenticated', async (event) => {
        const auth = event.data.authenticated
        if (!auth) {
          this.retryWithExponentialBackoff(() => this.tryAuthenticate())
        }
        else {
          this.tryAnnounce()
        }
      })

      this.websocket.onerror = (event) => {
        this.opts.onError?.(event)

        if ('error' in event && event.error instanceof Error) {
          if (event.error.message === 'Received network error or non-101 status code.') {
            this.connected = false

            if (!this.opts.autoReconnect) {
              this.opts.onError?.(event)
              this.opts.onClose?.()
              reject(event.error)
              return
            }

            reject(event.error)
          }
        }
      }

      this.websocket.onclose = () => {
        this.opts.onClose?.()
        this.connected = false

        if (!this.opts.autoReconnect) {
          this.opts.onClose?.()
        }
        else {
          this.tryReconnectWithExponentialBackoff()
        }
      }

      this.websocket.onmessage = (event) => {
        this.handleMessage(event)
      }

      this.websocket.onopen = () => {
        this.reconnectAttempts = 0

        if (this.opts.token) {
          this.tryAuthenticate()
        }
        else {
          this.tryAnnounce()
        }

        this.connected = true

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
      this.send({ type: 'module:authenticate', data: { token: this.opts.token || '' } })
    }
  }

  private async handleMessage(event: any) {
    try {
      const data = JSON.parse(event.data) as WebSocketEvent<C>
      const listeners = this.eventListeners.get(data.type)
      if (!listeners)
        return

      for (const listener of listeners)
        await listener(data)
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
    if (!this.eventListeners.get(event)) {
      this.eventListeners.set(event, [])
    }

    const listeners = this.eventListeners.get(event)
    if (!listeners) {
      return
    }

    listeners.push(callback as unknown as (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>)
  }

  send(data: WebSocketEvent<C>): void {
    this.websocket?.send(JSON.stringify(data))
  }

  sendRaw(data: string | ArrayBufferLike | ArrayBufferView): void {
    this.websocket?.send(data)
  }

  close(): void {
    this.shouldClose = true

    if (this.connected && this.websocket) {
      this.websocket.close()
      this.connected = false
    }
  }
}
