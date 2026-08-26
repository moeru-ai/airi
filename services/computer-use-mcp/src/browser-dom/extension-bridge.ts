import type { AddressInfo } from 'node:net'

import type {
  BrowserDomBridgeConfig,
  BrowserDomBridgeHello,
  BrowserDomBridgeStatus,
  BrowserDomFrameResult,
} from '../types'

import { randomUUID } from 'node:crypto'

import { WebSocket, WebSocketServer } from 'ws'

const SUPPORTED_ACTIONS = new Set([
  'findElement',
  'findElements',
  'getActiveTab',
  'getAllFrames',
  'getClickTarget',
  'getComputedStyles',
  'getElementAttributes',
  'readAllFramesDOM',
  'readInputValue',
  'waitForElement',
])
const WAIT_FOR_ELEMENT_BRIDGE_TIMEOUT_GRACE_MS = 1_000

interface PendingBridgeRequest {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
  timeoutId: NodeJS.Timeout
}

export class BrowserDomExtensionBridge {
  private readonly pending = new Map<string, PendingBridgeRequest>()
  private server?: WebSocketServer
  private socket?: WebSocket
  private started = false
  private status: BrowserDomBridgeStatus

  constructor(private readonly config: BrowserDomBridgeConfig) {
    this.status = {
      connected: false,
      enabled: config.enabled,
      host: config.host,
      pendingRequests: 0,
      port: config.port,
    }
  }

  async callAction<TResult = unknown>(
    action: string,
    payload: Record<string, unknown> = {},
    options?: { timeoutMs?: number },
  ): Promise<TResult> {
    if (!this.config.enabled) {
      throw new Error('browser dom bridge is disabled')
    }

    if (!this.supportsAction(action)) {
      throw new Error(`browser dom bridge transport does not support action "${action}"`)
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(this.status.lastError || 'browser dom bridge is not connected')
    }

    const id = randomUUID()
    const requestPayload = {
      action,
      id,
      ...payload,
    }

    const effectiveTimeoutMs = options?.timeoutMs ?? this.config.requestTimeoutMs

    const result = await new Promise<TResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id)
        this.status.pendingRequests = this.pending.size
        reject(new Error(`browser dom bridge timed out waiting for ${action}`))
      }, effectiveTimeoutMs)

      this.pending.set(id, {
        reject,
        resolve: value => resolve(value as TResult),
        timeoutId,
      })
      this.status.pendingRequests = this.pending.size

      this.socket!.send(JSON.stringify(requestPayload), (error) => {
        if (!error)
          return

        const pending = this.pending.get(id)
        if (!pending)
          return

        clearTimeout(pending.timeoutId)
        this.pending.delete(id)
        this.status.pendingRequests = this.pending.size
        pending.reject(asError(error, `failed to send ${action} to browser dom bridge`))
      })
    })

    return result
  }

  async checkCheckbox(params: {
    checked?: boolean
    frameIds?: number[]
    selector: string
    tabId?: number
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('checkCheckbox', params)
  }

  async clickSelector(params: {
    frameIds?: number[]
    selector: string
    tabId?: number
  }) {
    const targets = await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('getClickTarget', {
      frameIds: params.frameIds,
      selector: params.selector,
      tabId: params.tabId,
    })

    const target = targets.find((entry) => {
      const payload = unwrapResultPayload<{ x?: number, y?: number }>(entry.result)
      return typeof payload?.x === 'number' && typeof payload?.y === 'number'
    })

    if (!target) {
      throw new Error(`browser dom bridge could not find a clickable target for selector "${params.selector}"`)
    }

    const payload = unwrapResultPayload<{ element?: Record<string, unknown>, x: number, y: number }>(target.result)
    const clickResults = await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('clickAt', {
      frameIds: [target.frameId],
      tabId: params.tabId,
      x: payload!.x,
      y: payload!.y,
    })

    return {
      clickResults,
      targetElement: payload?.element,
      targetFrameId: target.frameId,
      targetPoint: {
        x: payload!.x,
        y: payload!.y,
      },
    }
  }

  async close() {
    this.rejectPendingRequests(new Error('browser dom bridge closed before completing pending request'))

    if (this.socket) {
      this.socket.close()
      this.socket = undefined
    }
    this.status.connected = false

    if (this.server) {
      const server = this.server
      this.server = undefined
      await new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
    }
  }

  async findElements(params: {
    frameIds?: number[]
    maxResults?: number
    selector: string
    tabId?: number
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('findElements', {
      frameIds: params.frameIds,
      max: params.maxResults ?? 10,
      selector: params.selector,
      tabId: params.tabId,
    })
  }

  async getActiveTab() {
    return await this.callAction<null | Record<string, unknown>>('getActiveTab')
  }

  async getAllFrames(params: { tabId?: number } = {}) {
    return await this.callAction<Array<Record<string, unknown>>>('getAllFrames', params)
  }

  async getComputedStyles(params: {
    frameIds?: number[]
    properties?: string[]
    selector: string
    tabId?: number
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('getComputedStyles', {
      frameIds: params.frameIds,
      properties: params.properties,
      selector: params.selector,
      tabId: params.tabId,
    })
  }

  async getElementAttributes(params: {
    frameIds?: number[]
    selector: string
    tabId?: number
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('getElementAttributes', params)
  }

  getStatus(): BrowserDomBridgeStatus {
    return {
      ...this.status,
      lastHello: this.status.lastHello ? { ...this.status.lastHello } : undefined,
    }
  }

  async readAllFramesDom(params: {
    frameIds?: number[]
    includeText?: boolean
    maxElements?: number
    tabId?: number
  } = {}) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('readAllFramesDOM', {
      frameIds: params.frameIds,
      opts: {
        includeText: params.includeText ?? true,
        maxElements: params.maxElements ?? 200,
      },
      tabId: params.tabId,
    })
  }

  async readInputValue(params: {
    frameIds?: number[]
    selector: string
    tabId?: number
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('readInputValue', params)
  }

  async selectOption(params: {
    frameIds?: number[]
    selector: string
    tabId?: number
    value: string
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('selectOption', params)
  }

  async setInputValue(params: {
    blur?: boolean
    frameIds?: number[]
    selector: string
    simulateKeystrokes?: boolean
    tabId?: number
    value: string
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('setInputValue', {
      frameIds: params.frameIds,
      opts: {
        blur: params.blur ?? true,
        simulateKeystrokes: params.simulateKeystrokes ?? false,
      },
      selector: params.selector,
      tabId: params.tabId,
      value: params.value,
    })
  }

  async start() {
    if (!this.config.enabled || this.started)
      return

    this.started = true

    try {
      const server = await new Promise<WebSocketServer>((resolve, reject) => {
        const nextServer = new WebSocketServer({
          host: this.config.host,
          port: this.config.port,
        })

        function onListening() {
          cleanup()
          resolve(nextServer)
        }

        function onError(error: Error) {
          cleanup()
          reject(error)
        }

        function cleanup() {
          nextServer.off('listening', onListening)
          nextServer.off('error', onError)
        }

        nextServer.once('listening', onListening)
        nextServer.once('error', onError)
      })

      this.server = server
      const address = server.address()
      if (address && typeof address === 'object') {
        this.status.host = (address as AddressInfo).address
        this.status.port = (address as AddressInfo).port
      }
      this.status.lastError = undefined

      server.on('connection', (socket) => {
        if (this.socket && this.socket !== socket) {
          this.socket.close()
        }

        this.socket = socket
        this.status.connected = true
        this.status.lastError = undefined

        socket.on('message', data => this.handleMessage(data))
        socket.on('close', () => {
          if (this.socket === socket) {
            this.socket = undefined
            this.status.connected = false
            this.rejectPendingRequests(new Error('browser dom bridge disconnected before completing pending request'))
          }
        })
        socket.on('error', (error) => {
          this.status.lastError = asError(error, 'browser dom bridge socket error').message
        })
      })

      server.on('error', (error) => {
        this.status.lastError = asError(error, 'browser dom bridge server error').message
      })
    }
    catch (error) {
      this.started = false
      this.status.lastError = asError(error, 'failed to start browser dom bridge').message
    }
  }

  supportsAction(action: string) {
    return SUPPORTED_ACTIONS.has(action)
  }

  async triggerEvent(params: {
    eventName: string
    eventType?: string
    frameIds?: number[]
    opts?: Record<string, unknown>
    selector: string
    tabId?: number
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('triggerEvent', {
      eventName: params.eventName,
      frameIds: params.frameIds,
      opts: {
        ...params.opts,
        ...(params.eventType ? { type: params.eventType } : {}),
      },
      selector: params.selector,
      tabId: params.tabId,
    })
  }

  async waitForElement(params: {
    frameIds?: number[]
    selector: string
    tabId?: number
    timeoutMs?: number
  }) {
    const effectiveTimeout = params.timeoutMs ?? this.config.requestTimeoutMs
    // NOTICE: The bridge-level timeout only needs a small transport grace: the
    // extension now passes the remaining waitForElement budget into each
    // frame-level send, so slow or unresponsive frames no longer require an
    // extra full send-message timeout on top of the requested poll budget.
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('waitForElement', {
      frameIds: params.frameIds,
      selector: params.selector,
      tabId: params.tabId,
      timeoutMs: effectiveTimeout,
    }, {
      timeoutMs: effectiveTimeout + WAIT_FOR_ELEMENT_BRIDGE_TIMEOUT_GRACE_MS,
    })
  }

  private handleMessage(raw: WebSocket.RawData) {
    let data: Record<string, unknown> | undefined
    try {
      data = JSON.parse(String(raw)) as Record<string, unknown>
    }
    catch {
      return
    }

    if (data.type === 'hello') {
      const nextHello: BrowserDomBridgeHello = {
        connectedAt: new Date().toISOString(),
        source: typeof data.source === 'string' ? data.source : undefined,
        version: typeof data.version === 'string' ? data.version : undefined,
      }
      this.status.lastHello = nextHello
      this.status.lastError = undefined
      return
    }

    const requestId = typeof data.id === 'string' ? data.id : undefined
    if (!requestId)
      return

    const pending = this.pending.get(requestId)
    if (!pending)
      return

    clearTimeout(pending.timeoutId)
    this.pending.delete(requestId)
    this.status.pendingRequests = this.pending.size

    if (data.ok === false) {
      const message = typeof data.error === 'string' && data.error.trim()
        ? data.error
        : 'browser dom bridge request failed'
      pending.reject(new Error(message))
      return
    }

    pending.resolve(data.result)
  }

  private rejectPendingRequests(error: Error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timeoutId)
      pending.reject(error)
    }

    this.pending.clear()
    this.status.pendingRequests = 0
  }
}

function asError(error: unknown, fallback: string) {
  if (error instanceof Error)
    return error

  return new Error(typeof error === 'string' && error.trim() ? error : fallback)
}

function toRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return undefined

  return value as Record<string, unknown>
}

function unwrapResultPayload<T>(value: unknown): T | undefined {
  const record = toRecord(value)
  if (!record)
    return value as T

  if ('data' in record)
    return record.data as T

  return value as T
}
