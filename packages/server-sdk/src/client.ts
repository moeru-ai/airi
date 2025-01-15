import type { WebSocketEvent } from '@proj-airi/server-shared/types'
import type { Blob } from 'node:buffer'
import WebSocket from 'crossws/websocket'

export class Client {
  private websocket: WebSocket

  constructor(url: string) {
    this.websocket = new WebSocket(url)
  }

  send(data: WebSocketEvent): void {
    this.websocket.send(JSON.stringify(data))
  }

  sendRaw(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    this.websocket.send(data)
  }
}
