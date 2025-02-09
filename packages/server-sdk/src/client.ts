import type { WebSocketBaseEvent, WebSocketEvent, WebSocketEvents } from '@proj-airi/server-shared/types'
import type { Blob } from 'node:buffer'

import WebSocket from 'crossws/websocket'
import { defu } from 'defu'

import { sleep } from './utils'

export interface ClientOptions {
  url?: string
  name: string
  possibleEvents?: Array<(keyof WebSocketEvents)>
  token?: string
}

export class Client {
  private opts: Required<ClientOptions>
  private websocket: WebSocket
  private eventListeners: Map<
    keyof WebSocketEvents,
    Array<(data: WebSocketBaseEvent<
      keyof WebSocketEvents,
      WebSocketEvents[keyof WebSocketEvents]
    >) => void | Promise<void>>
  > = new Map()

  private authenticateAttempts = 0

  constructor(options: ClientOptions) {
    this.opts = defu<Required<ClientOptions>, Required<Omit<ClientOptions, 'name' | 'token'>>[]>(
      options,
      { url: 'ws://localhost:6121/ws', possibleEvents: [] },
    )

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

    this.websocket.onmessage = this.handleMessage.bind(this)

    this.websocket.onopen = () => {
      if (this.opts.token) {
        this.tryAuthenticate()
      }
      else {
        this.tryAnnounce()
      }
    }

    this.websocket.onclose = () => {
      this.authenticateAttempts = 0
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
    const data = JSON.parse(event.data) as WebSocketEvent
    const listeners = this.eventListeners.get(data.type)
    if (!listeners)
      return

    for (const listener of listeners)
      await listener(data)
  }

  onEvent<E extends keyof WebSocketEvents>(
    event: E,
    callback: (data: WebSocketBaseEvent<E, WebSocketEvents[E]>) => void | Promise<void>,
  ): void {
    if (!this.eventListeners.get(event)) {
      this.eventListeners.set(event, [])
    }

    const listeners = this.eventListeners.get(event)
    listeners.push(callback)
    this.eventListeners.set(event, listeners)
  }

  send(data: WebSocketEvent): void {
    this.websocket.send(JSON.stringify(data))
  }

  sendRaw(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.websocket.send(data)
  }
}
