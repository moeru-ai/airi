declare module 'ws' {
  import type { IncomingMessage } from 'node:http'
  import type { Duplex } from 'node:stream'

  export type RawData = string | Buffer | ArrayBuffer | Buffer[]

  export interface ClientOptions {
    headers?: Record<string, string>
  }

  export class WebSocket {
    static readonly CONNECTING: number
    static readonly OPEN: number
    static readonly CLOSING: number
    static readonly CLOSED: number

    binaryType: string
    readyState: number

    constructor(address: string | URL, options?: ClientOptions)

    send(data: string | ArrayBuffer | Uint8Array): void
    close(code?: number, reason?: string): void

    on(event: 'open', listener: () => void): this
    on(event: 'message', listener: (data: RawData, isBinary: boolean) => void): this
    on(event: 'error', listener: (error: Error) => void): this
    on(event: 'close', listener: () => void): this
  }

  export class WebSocketServer {
    constructor(options?: { noServer?: boolean })

    on(event: 'connection', listener: (socket: WebSocket, request: IncomingMessage) => void): this
    handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer, callback: (socket: WebSocket) => void): void
    emit(event: 'connection', socket: WebSocket, request: IncomingMessage): boolean
    close(): void
  }
}
