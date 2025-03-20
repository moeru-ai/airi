import type { WebSocketBaseEvent, WebSocketEvent, WebSocketEvents } from '@proj-airi/server-shared/types'

import WebSocket from 'crossws/websocket'
import { defu } from 'defu'

import { sleep } from './utils'

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
  private opts: Required<ClientOptions<C>>
  private websocket: WebSocket
  private eventListeners: Map<keyof WebSocketEvents, Array<(data: WebSocketBaseEvent<keyof WebSocketEvents<C>, WebSocketEvents<C>[keyof WebSocketEvents<C>]>) => void | Promise<void>>> = new Map()

  private authenticateAttempts = 0

  constructor(options: ClientOptions<C>) {
    this.opts = defu<Required<ClientOptions<C>>, Required<Omit<ClientOptions<C>, 'name' | 'token'>>[]>(
      options,
      {
        url: 'ws://localhost:6121/ws',
        possibleEvents: [],
        onError: () => { },
        onClose: () => { },
        autoConnect: true,
        autoReconnect: true,
      },
    )

    if (this.opts.autoConnect) {
      this.connect()
    }
  }

  connect() {
    if (this.connected)
      return

    this.websocket = new WebSocket(this.opts.url)

    this.onEvent('module:authenticated', async (event) => {
      const auth = event.data.authenticated
      if (!auth) {
        this.authenticateAttempts++
        await sleep(2 ** this.authenticateAttempts * 1000)
        this.tryAuthenticate()
      }
      else {
        this.tryAnnounce()
      }
    })

    this.websocket.onerror = (event) => {
      this.opts.onError?.(event)
    }

    this.websocket.onmessage = this.handleMessage.bind(this)

    this.websocket.onopen = () => {
      if (this.opts.token) {
        this.tryAuthenticate()
      }
      else {
        this.tryAnnounce()
      }

      this.connected = true
    }

    this.websocket.onclose = () => {
      this.connected = false
      this.authenticateAttempts = 0
      this.opts.onClose?.()
      if (this.opts.autoReconnect) {
        this.connect()
      }
    }
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
    const data = JSON.parse(event.data) as WebSocketEvent<C>
    const listeners = this.eventListeners.get(data.type)
    if (!listeners)
      return

    for (const listener of listeners)
      await listener(data)
  }

  onEvent<E extends keyof WebSocketEvents<C>>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents<C>[E]>) => void | Promise<void>,
  ): void {
    if (!this.eventListeners.get(event)) {
      this.eventListeners.set(event, [])
    }

    const listeners = this.eventListeners.get(event)
    listeners.push(callback)
    this.eventListeners.set(event, listeners)
  }

  send(data: WebSocketEvent<C>): void {
    this.websocket.send(JSON.stringify(data))
  }

  sendRaw(data: string | ArrayBufferLike | ArrayBufferView): void {
    this.websocket.send(data)
  }
}
