import type { ClientConnector, ClientEvents } from '@proj-airi/server-sdk'

type HostBridgeCommand
  = | { code?: number, id: string, kind: 'close', reason?: string }
    | { data: string, id: string, kind: 'send' }
    | { id: string, kind: 'connect', url: string }

type HostBridgeEvent
  = | { code?: number, id: string, kind: 'close', reason?: string }
    | { data: string, id: string, kind: 'message' }
    | { id: string, kind: 'error', message: string }
    | { id: string, kind: 'open' }

declare global {
  interface Window {
    __airiHostBridge?: {
      onNativeMessage?: (payload: string) => void
    }
    AiriHostBridge?: {
      postMessage: (payload: string) => void
    }
    webkit?: {
      messageHandlers?: {
        airiHostBridge?: {
          postMessage: (payload: string) => void
        }
      }
    }
  }
}

const connections = new Map<string, HostBridgeConnection>()

class HostBridgeConnection {
  readonly id = crypto.randomUUID()
  private opened = false
  private settled = false

  constructor(
    private readonly url: string,
    private readonly events: ClientEvents<string>,
    private readonly resolve: () => void,
    private readonly reject: (error: Error) => void,
  ) {
    connections.set(this.id, this)

    postBridgeMessage({
      id: this.id,
      kind: 'connect',
      url: this.url,
    })
  }

  close(code?: number, reason?: string) {
    if (this.settled && !this.opened) {
      return
    }

    postBridgeMessage({
      code,
      id: this.id,
      kind: 'close',
      reason,
    })
  }

  handleNativeEvent(event: HostBridgeEvent) {
    switch (event.kind) {
      case 'close':
        connections.delete(this.id)
        if (!this.settled) {
          this.settled = true
          this.reject(createCloseBeforeOpenError(event))
          return
        }

        this.opened = false
        this.events.close({ code: event.code, reason: event.reason })
        break

      case 'error':
        if (!this.settled) {
          this.settled = true
          connections.delete(this.id)
          this.reject(new Error(event.message))
          return
        }

        this.events.error(new Error(event.message))
        break

      case 'message':
        this.events.message(event.data)
        break

      case 'open':
        this.opened = true
        this.settled = true
        this.resolve()
        break
    }
  }

  send(data: string) {
    if (!this.opened) {
      return false
    }

    postBridgeMessage({
      data,
      id: this.id,
      kind: 'send',
    })

    return true
  }
}

export function getHostWebSocketConnector(url: string): ClientConnector<string> | undefined {
  if (!window.AiriHostBridge && !window.webkit?.messageHandlers?.airiHostBridge) {
    return undefined
  }

  window.__airiHostBridge = window.__airiHostBridge ?? {}
  window.__airiHostBridge.onNativeMessage = dispatchNativeEvent

  return {
    connect(events) {
      let connection: HostBridgeConnection | undefined
      const opened = new Promise<void>((resolve, reject) => {
        connection = new HostBridgeConnection(url, events, resolve, reject)
      })

      return opened.then(() => {
        const activeConnection = connection
        if (!activeConnection) {
          throw new Error('AIRI host websocket bridge connection was not created')
        }

        return {
          close: (code?: number, reason?: string) => activeConnection.close(code, reason),
          send: message => activeConnection.send(message),
        }
      })
    },
  }
}

function createCloseBeforeOpenError(event: Extract<HostBridgeEvent, { kind: 'close' }>) {
  const reason = event.reason ? ` ${event.reason}` : ''
  const code = typeof event.code === 'number' ? ` with code ${event.code}` : ''
  return new Error(`AIRI host websocket bridge closed before opening${code}.${reason}`)
}

function dispatchNativeEvent(payload: string) {
  const event = JSON.parse(payload) as HostBridgeEvent
  const connection = connections.get(event.id)
  if (!connection) {
    return
  }

  connection.handleNativeEvent(event)
}

function postBridgeMessage(command: HostBridgeCommand) {
  if (window.AiriHostBridge) {
    window.AiriHostBridge.postMessage(JSON.stringify(command))
    return
  }

  if (window.webkit?.messageHandlers?.airiHostBridge) {
    window.webkit.messageHandlers.airiHostBridge.postMessage(JSON.stringify(command))
    return
  }

  throw new Error('AIRI host websocket bridge is unavailable')
}
