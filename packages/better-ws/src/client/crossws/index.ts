import type { ClientConnector } from '../..'

import NativeWebSocket from 'crossws/websocket'

/**
 * Options for the CrossWS-backed text client connector.
 */
export interface CrossWsConnectorOptions {
  /** Optional subprotocols passed to the CrossWS socket constructor. */
  protocols?: string | string[]
  /** URL passed to the CrossWS socket constructor. */
  url: string | URL
  /** Runtime socket constructor. Defaults to `crossws/websocket`. */
  wsConstructor?: CrossWsConstructor
}

/**
 * WebSocket constructor accepted by the CrossWS client connector.
 *
 * CrossWS exports a DOM-compatible constructor in browser-like runtimes and a
 * Node-backed constructor in Node. Tests may inject a narrower fake as long as
 * it exposes the event handler properties and text send/close operations used
 * by the connector.
 */
export interface CrossWsConstructor {
  new(url: string | URL, protocols?: string | string[]): CrossWsSocket
}

interface CrossWsCloseEvent {
  code?: number
  reason?: string
  wasClean?: boolean
}

interface CrossWsErrorEvent {
  error?: unknown
}

interface CrossWsMessageEvent {
  data: unknown
}

interface CrossWsSocket {
  close: (code?: number, reason?: string) => void
  onclose?: ((event: CrossWsCloseEvent) => void) | null
  onerror?: ((event: CrossWsErrorEvent | unknown) => void) | null
  onmessage?: ((event: CrossWsMessageEvent) => void) | null
  onopen?: ((event: unknown) => void) | null
  ping?: () => boolean | number | void
  pong?: () => boolean | number | void
  send: (message: string) => boolean | number | void
}

/** Creates a CrossWS-backed text connector for better-ws clients. */
export function createCrossWsConnector(options: CrossWsConnectorOptions): ClientConnector<string> {
  return {
    connect(events) {
      const WsConstructor = options.wsConstructor ?? (NativeWebSocket as unknown as CrossWsConstructor)
      const ws = new WsConstructor(options.url, options.protocols)

      return new Promise((resolve, reject) => {
        let opened = false
        let failedBeforeOpen = false

        ws.onopen = () => {
          opened = true
          resolve({
            close: (code, reason) => ws.close(code, reason),
            ping: typeof ws.ping === 'function' ? () => ws.ping!() : undefined,
            pong: typeof ws.pong === 'function' ? () => ws.pong!() : undefined,
            send: message => ws.send(message),
          })
        }

        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            events.message(event.data)
            return
          }

          events.error(new TypeError('The CrossWS connector only supports text messages.'))
        }

        ws.onerror = (event) => {
          const error = errorFromEvent(event)
          if (!opened) {
            failedBeforeOpen = true
            reject(error)
            return
          }

          events.error(error)
        }

        ws.onclose = (event) => {
          if (failedBeforeOpen) {
            return
          }

          if (!opened) {
            reject(createCloseBeforeOpenError(event))
            return
          }

          events.close({
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          })
        }
      })
    },
  }
}

function createCloseBeforeOpenError(event: CrossWsCloseEvent): Error {
  const reason = event.reason ? ` ${event.reason}` : ''
  const code = typeof event.code === 'number' ? ` with code ${event.code}` : ''
  return new Error(`CrossWS connection closed before opening${code}.${reason}`)
}

function errorFromEvent(event: CrossWsErrorEvent | unknown): Error {
  if (event instanceof Error) {
    return event
  }

  if (typeof event === 'object' && event !== null && 'error' in event && event.error instanceof Error) {
    return event.error
  }

  return new Error('CrossWS connection error.')
}
