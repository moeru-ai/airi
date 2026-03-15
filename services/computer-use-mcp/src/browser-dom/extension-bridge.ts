import type { AddressInfo } from 'node:net'

import type {
  BrowserDomBridgeConfig,
  BrowserDomBridgeHello,
  BrowserDomBridgeStatus,
  BrowserDomFrameResult,
} from '../types'

import { randomUUID } from 'node:crypto'

import { errorMessageFrom } from '@moeru/std'
import { WebSocket, WebSocketServer } from 'ws'

interface PendingBridgeRequest {
  reject: (error: Error) => void
  resolve: (value: unknown) => void
  timeoutId: NodeJS.Timeout
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

export class BrowserDomExtensionBridge {
  private readonly pending = new Map<string, PendingBridgeRequest>()
  private server?: WebSocketServer
  private socket?: WebSocket
  private started = false
  private status: BrowserDomBridgeStatus

  constructor(private readonly config: BrowserDomBridgeConfig) {
    this.status = {
      enabled: config.enabled,
      host: config.host,
      port: config.port,
      connected: false,
      pendingRequests: 0,
    }
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

        let cleanup = () => {}

        const onListening = () => {
          cleanup()
          resolve(nextServer)
        }

        const onError = (error: Error) => {
          cleanup()
          reject(error)
        }

        cleanup = () => {
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
          }
        })
        socket.on('error', (error) => {
          this.status.lastError = errorMessageFrom(error) || 'browser dom bridge socket error'
        })
      })

      server.on('error', (error) => {
        this.status.lastError = errorMessageFrom(error) || 'browser dom bridge server error'
      })
    }
    catch (error) {
      this.status.lastError = errorMessageFrom(error) || 'failed to start browser dom bridge'
    }
  }

  async close() {
    for (const [requestId, pending] of this.pending.entries()) {
      clearTimeout(pending.timeoutId)
      pending.reject(new Error(`browser dom bridge closed before completing request ${requestId}`))
    }
    this.pending.clear()
    this.status.pendingRequests = 0

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

  getStatus(): BrowserDomBridgeStatus {
    return {
      ...this.status,
      lastHello: this.status.lastHello ? { ...this.status.lastHello } : undefined,
    }
  }

  async callAction<TResult = unknown>(action: string, payload: Record<string, unknown> = {}): Promise<TResult> {
    if (!this.config.enabled) {
      throw new Error('browser dom bridge is disabled')
    }

    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      throw new Error(this.status.lastError || 'browser dom bridge is not connected')
    }

    const id = randomUUID()
    const requestPayload = {
      id,
      action,
      ...payload,
    }

    const result = await new Promise<TResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pending.delete(id)
        this.status.pendingRequests = this.pending.size
        reject(new Error(`browser dom bridge timed out waiting for ${action}`))
      }, this.config.requestTimeoutMs)

      this.pending.set(id, {
        resolve: value => resolve(value as TResult),
        reject,
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
        pending.reject(new Error(errorMessageFrom(error) || `failed to send ${action} to browser dom bridge`))
      })
    })

    return result
  }

  async getActiveTab() {
    return await this.callAction<Record<string, unknown> | null>('getActiveTab')
  }

  async getAllFrames(params: { tabId?: number } = {}) {
    return await this.callAction<Array<Record<string, unknown>>>('getAllFrames', params)
  }

  async readAllFramesDom(params: {
    tabId?: number
    frameIds?: number[]
    includeText?: boolean
    maxElements?: number
  } = {}) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('readAllFramesDOM', {
      tabId: params.tabId,
      frameIds: params.frameIds,
      opts: {
        includeText: params.includeText ?? true,
        maxElements: params.maxElements ?? 200,
      },
    })
  }

  async findElements(params: {
    selector: string
    maxResults?: number
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('findElements', {
      selector: params.selector,
      max: params.maxResults ?? 10,
      tabId: params.tabId,
      frameIds: params.frameIds,
    })
  }

  async readInputValue(params: {
    selector: string
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('readInputValue', params)
  }

  async setInputValue(params: {
    selector: string
    value: string
    simulateKeystrokes?: boolean
    blur?: boolean
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('setInputValue', {
      selector: params.selector,
      value: params.value,
      opts: {
        simulateKeystrokes: params.simulateKeystrokes ?? false,
        blur: params.blur ?? true,
      },
      tabId: params.tabId,
      frameIds: params.frameIds,
    })
  }

  async checkCheckbox(params: {
    selector: string
    checked?: boolean
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('checkCheckbox', params)
  }

  async selectOption(params: {
    selector: string
    value: string
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('selectOption', params)
  }

  async getElementAttributes(params: {
    selector: string
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('getElementAttributes', params)
  }

  async getComputedStyles(params: {
    selector: string
    properties?: string[]
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('getComputedStyles', {
      selector: params.selector,
      properties: params.properties,
      tabId: params.tabId,
      frameIds: params.frameIds,
    })
  }

  async triggerEvent(params: {
    selector: string
    eventName: string
    eventType?: string
    opts?: Record<string, unknown>
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('triggerEvent', {
      selector: params.selector,
      eventName: params.eventName,
      opts: {
        ...params.opts,
        ...(params.eventType ? { type: params.eventType } : {}),
      },
      tabId: params.tabId,
      frameIds: params.frameIds,
    })
  }

  async waitForElement(params: {
    selector: string
    timeoutMs?: number
    tabId?: number
    frameIds?: number[]
  }) {
    return await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('waitForElement', {
      selector: params.selector,
      timeoutMs: params.timeoutMs ?? this.config.requestTimeoutMs,
      tabId: params.tabId,
      frameIds: params.frameIds,
    })
  }

  async clickSelector(params: {
    selector: string
    tabId?: number
    frameIds?: number[]
  }) {
    const targets = await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('getClickTarget', {
      selector: params.selector,
      tabId: params.tabId,
      frameIds: params.frameIds,
    })

    const target = targets.find((entry) => {
      const payload = unwrapResultPayload<{ x?: number, y?: number }>(entry.result)
      return typeof payload?.x === 'number' && typeof payload?.y === 'number'
    })

    if (!target) {
      throw new Error(`browser dom bridge could not find a clickable target for selector "${params.selector}"`)
    }

    const payload = unwrapResultPayload<{ x: number, y: number, element?: Record<string, unknown> }>(target.result)
    const clickResults = await this.callAction<Array<BrowserDomFrameResult<Record<string, unknown>>>>('clickAt', {
      x: payload!.x,
      y: payload!.y,
      tabId: params.tabId,
      frameIds: [target.frameId],
    })

    return {
      targetFrameId: target.frameId,
      targetPoint: {
        x: payload!.x,
        y: payload!.y,
      },
      targetElement: payload?.element,
      clickResults,
    }
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
        source: typeof data.source === 'string' ? data.source : undefined,
        version: typeof data.version === 'string' ? data.version : undefined,
        connectedAt: new Date().toISOString(),
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
}
