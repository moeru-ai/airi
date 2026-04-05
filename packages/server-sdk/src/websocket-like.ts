export interface WebSocketMessageEventLike<T = string> {
  data: T
}

export interface WebSocketErrorEventLike {
  error?: Error | unknown
}

export interface WebSocketLike {
  readonly readyState: number

  onopen?: (event?: unknown) => void
  onmessage?: (event: WebSocketMessageEventLike) => void
  onerror?: (event: WebSocketErrorEventLike | unknown) => void
  onclose?: (event?: unknown) => void

  send: (data: string | ArrayBufferLike | ArrayBufferView) => void
  close: (code?: number, reason?: string) => void

  ping?: () => void
  pong?: () => void
}

export interface WebSocketLikeConstructor {
  readonly OPEN: number
  readonly CLOSING: number
  readonly CLOSED: number

  new (url: string): WebSocketLike
}
