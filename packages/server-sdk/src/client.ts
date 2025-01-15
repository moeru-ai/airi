import type { WebSocketEvent, WebSocketEvents } from '@proj-airi/server-shared/types'
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

  constructor(options: ClientOptions) {
    const opts = defu<Required<ClientOptions>, Required<Omit<ClientOptions, 'name'>>[]>(options, { url: 'ws://localhost:6121/ws', possibleEvents: [] })

    this.websocket = new WebSocket(opts.url)
    this.send({
      type: 'module:announce',
      data: {
        name: opts.name,
        possibleEvents: opts.possibleEvents,
      },
    })
  }

  send(data: WebSocketEvent): void {
    this.websocket.send(JSON.stringify(data))
  }

  sendRaw(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.websocket.send(data)
  }
}
