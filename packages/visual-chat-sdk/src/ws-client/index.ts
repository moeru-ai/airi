import type { GatewayWsClientMessage } from '@proj-airi/visual-chat-protocol'

export interface GatewayWsSessionAccess {
  sessionId: string
  sessionToken: string
}

export interface WsEvent {
  event: string
  sessionId: string
  data: unknown
  timestamp: number
}

export type WsEventHandler = (event: WsEvent) => void

export interface GatewayWsClientOptions {
  autoReconnect?: boolean
  getSessionAccess?: (sessionId: string) => GatewayWsSessionAccess | null | undefined
}

export class GatewayWsClient {
  private ws: WebSocket | null = null
  private handlers = new Map<string, Set<WsEventHandler>>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private messageQueue: GatewayWsClientMessage[] = []
  private desiredSubscriptions = new Set<string>()
  private activeSubscriptions = new Set<string>()
  private autoReconnect: boolean
  private getSessionAccess: (sessionId: string) => GatewayWsSessionAccess | null | undefined

  constructor(
    private wsUrl: string,
    options: GatewayWsClientOptions = {},
  ) {
    this.autoReconnect = options.autoReconnect ?? true
    this.getSessionAccess = options.getSessionAccess ?? (() => undefined)
  }

  connect(): void {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING))
      return

    this.ws = new WebSocket(this.wsUrl)

    this.ws.onopen = () => {
      this.activeSubscriptions.clear()
      this.restoreSubscriptions()
      this.flushQueuedMessages()
      this.emit('connected', { event: 'connected', sessionId: '', data: null, timestamp: Date.now() })
    }

    this.ws.onmessage = (msg) => {
      try {
        const event = JSON.parse(msg.data as string) as WsEvent
        this.emit(event.event, event)
      }
      catch { /* ignore */ }
    }

    this.ws.onclose = () => {
      this.emit('disconnected', { event: 'disconnected', sessionId: '', data: null, timestamp: Date.now() })
      if (this.autoReconnect)
        this.scheduleReconnect()
    }

    this.ws.onerror = () => {
      this.ws?.close()
    }
  }

  subscribe(sessionId: string): void {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId || this.desiredSubscriptions.has(normalizedSessionId))
      return

    this.desiredSubscriptions.add(normalizedSessionId)

    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendSubscribe(normalizedSessionId)
      this.activeSubscriptions.add(normalizedSessionId)
      return
    }

    if (!this.ws || this.ws.readyState === WebSocket.CLOSED)
      this.connect()
  }

  unsubscribe(sessionId: string): void {
    const normalizedSessionId = sessionId.trim()
    if (!normalizedSessionId || !this.desiredSubscriptions.has(normalizedSessionId))
      return

    this.desiredSubscriptions.delete(normalizedSessionId)
    this.activeSubscriptions.delete(normalizedSessionId)

    if (this.ws?.readyState === WebSocket.OPEN)
      this.sendRaw({ type: 'unsubscribe', sessionId: normalizedSessionId })
  }

  send(message: GatewayWsClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.sendRaw(message)
      return
    }

    this.messageQueue.push(message)
    if (!this.ws || this.ws.readyState === WebSocket.CLOSED)
      this.connect()
  }

  on(event: string, handler: WsEventHandler): () => void {
    if (!this.handlers.has(event))
      this.handlers.set(event, new Set())
    this.handlers.get(event)!.add(handler)
    return () => this.handlers.get(event)?.delete(handler)
  }

  disconnect(): void {
    this.autoReconnect = false
    if (this.reconnectTimer)
      clearTimeout(this.reconnectTimer)
    this.activeSubscriptions.clear()
    this.ws?.close()
    this.ws = null
  }

  private emit(eventName: string, event: WsEvent) {
    this.handlers.get(eventName)?.forEach(h => h(event))
    this.handlers.get('*')?.forEach(h => h(event))
  }

  private flushQueuedMessages() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return

    const queued = [...this.messageQueue]
    this.messageQueue = []
    for (const message of queued)
      this.sendRaw(message)
  }

  private restoreSubscriptions() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN)
      return

    for (const sessionId of this.desiredSubscriptions) {
      this.sendSubscribe(sessionId)
      this.activeSubscriptions.add(sessionId)
    }
  }

  private sendSubscribe(sessionId: string) {
    const sessionAccess = this.getSessionAccess(sessionId)
    if (!sessionAccess?.sessionToken)
      return

    this.sendRaw({
      type: 'subscribe',
      sessionId,
      sessionToken: sessionAccess.sessionToken,
    })
  }

  private sendRaw(message: GatewayWsClientMessage) {
    this.ws?.send(JSON.stringify(message))
  }

  private scheduleReconnect() {
    this.reconnectTimer = setTimeout(() => this.connect(), 3000)
  }
}
