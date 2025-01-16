import type { WebSocketBaseEvent, WebSocketEvent, WebSocketEvents } from '@proj-airi/server-shared/types'
import type { Blob } from 'node:buffer'
import WebSocket from 'crossws/websocket'
import { defu } from 'defu'

export interface ClientOptions {
  url?: string
  name: string
  possibleEvents?: Array<(keyof WebSocketEvents)>
}

export class Client {
  private websocket: WebSocket
  private eventListeners: Map<keyof WebSocketEvents, Array<(data: WebSocketBaseEvent<keyof WebSocketEvents, WebSocketEvents[keyof WebSocketEvents]>) => void | Promise<void>>> = new Map()

  constructor(options: ClientOptions) {
    const opts = defu<Required<ClientOptions>, Required<Omit<ClientOptions, 'name'>>[]>(options, { url: 'ws://localhost:6121/ws', possibleEvents: [] })

    this.websocket = new WebSocket(opts.url)
    this.websocket.onmessage = this.handleMessage.bind(this)
    this.websocket.onopen = () => {
      this.send({
        type: 'module:announce',
        data: {
          name: opts.name,
          possibleEvents: opts.possibleEvents,
        },
      })
    }
  }

  private async handleMessage(event: any) {
    const data = JSON.parse(event.data) as WebSocketEvent
    const listeners = this.eventListeners.get(data.type)
    if (!listeners)
      return

    for (const listener of listeners) {
      await listener(data)
    }
  }

  onEvent<E extends keyof WebSocketEvents>(event: E, callback: (data: WebSocketBaseEvent<E, WebSocketEvents[E]>) => void | Promise<void>): void {
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
