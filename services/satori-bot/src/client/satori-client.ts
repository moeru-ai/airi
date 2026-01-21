import type { SatoriEvent, SatoriIdentifyBody, SatoriReadyBody, SatoriSignal } from '../types/satori'

import WebSocket from 'ws'

import { useLogg } from '@guiiai/logg'

import { SatoriOpcode } from '../types/satori'
import { SatoriAPI } from './satori-api'

const log = useLogg('SatoriClient')

export interface SatoriClientConfig {
  url: string
  token?: string
  apiBaseUrl?: string
}

export class SatoriClient {
  private ws?: WebSocket
  private config: SatoriClientConfig
  private connected = false
  private lastSequenceNumber = 0
  private heartbeatInterval?: NodeJS.Timeout
  private reconnectTimeout?: NodeJS.Timeout
  private shouldReconnect = true
  private apiClients = new Map<string, SatoriAPI>()

  // Event handlers
  private eventHandlers = new Map<string, Set<(event: SatoriEvent) => void | Promise<void>>>()
  private readyHandler?: (logins: SatoriReadyBody) => void | Promise<void>

  constructor(config: SatoriClientConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    if (this.connected) {
      log.warn('Already connected to Satori server')
      return
    }

    return new Promise((resolve, reject) => {
      try {
        log.log(`Connecting to Satori server: ${this.config.url}`)
        this.ws = new WebSocket(this.config.url)

        this.ws.on('open', () => {
          log.log('WebSocket connection established')
          this.connected = true
          this.sendIdentify()
          this.startHeartbeat()
          resolve()
        })

        this.ws.on('message', (data: WebSocket.Data) => {
          void this.handleMessage(data)
        })

        this.ws.on('close', (code, reason) => {
          log.log(`WebSocket closed: ${code} - ${reason.toString()}`)
          this.handleDisconnect()
        })

        this.ws.on('error', (error) => {
          log.withError(error).error('WebSocket error')
          if (!this.connected) {
            reject(error)
          }
        })
      }
      catch (error) {
        log.withError(error as Error).error('Failed to create WebSocket connection')
        reject(error)
      }
    })
  }

  private sendIdentify(): void {
    const body: SatoriIdentifyBody = {
      token: this.config.token,
      sn: this.lastSequenceNumber,
    }

    this.sendSignal({
      op: SatoriOpcode.IDENTIFY,
      body,
    })

    log.log('Sent IDENTIFY signal')
  }

  private startHeartbeat(): void {
    // Send PING every 10 seconds
    this.heartbeatInterval = setInterval(() => {
      if (this.connected) {
        this.sendSignal({ op: SatoriOpcode.PING })
      }
    }, 10000)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = undefined
    }
  }

  private async handleMessage(data: WebSocket.Data): Promise<void> {
    try {
      const signal = JSON.parse(data.toString()) as SatoriSignal

      switch (signal.op) {
        case SatoriOpcode.READY: {
          const readyBody = signal.body as SatoriReadyBody
          log.log('Received READY signal')

          // Initialize API clients for each login
          this.initializeAPIClients(readyBody)

          if (this.readyHandler) {
            await this.readyHandler(readyBody)
          }
          break
        }

        case SatoriOpcode.EVENT: {
          const event = signal.body as SatoriEvent
          this.lastSequenceNumber = event.id
          await this.handleEvent(event)
          break
        }

        case SatoriOpcode.PONG: {
          // Heartbeat response received
          break
        }

        case SatoriOpcode.META: {
          log.log('Received META signal:', signal.body)
          break
        }

        default:
          log.warn('Unknown opcode received:', signal.op)
      }
    }
    catch (error) {
      log.withError(error as Error).error('Failed to handle message')
    }
  }

  private async handleEvent(event: SatoriEvent): Promise<void> {
    log.log(`Received event: ${event.type}`)

    const handlers = this.eventHandlers.get(event.type)
    if (handlers && handlers.size > 0) {
      const promises: Promise<void>[] = []
      for (const handler of handlers) {
        promises.push(Promise.resolve(handler(event)))
      }
      await Promise.allSettled(promises)
    }

    // Also trigger wildcard handlers
    const wildcardHandlers = this.eventHandlers.get('*')
    if (wildcardHandlers && wildcardHandlers.size > 0) {
      const promises: Promise<void>[] = []
      for (const handler of wildcardHandlers) {
        promises.push(Promise.resolve(handler(event)))
      }
      await Promise.allSettled(promises)
    }
  }

  private handleDisconnect(): void {
    this.connected = false
    this.stopHeartbeat()

    if (this.shouldReconnect) {
      log.log('Attempting to reconnect in 5 seconds...')
      this.reconnectTimeout = setTimeout(() => {
        void this.connect()
      }, 5000)
    }
  }

  private sendSignal(signal: SatoriSignal): void {
    if (this.ws && this.connected) {
      this.ws.send(JSON.stringify(signal))
    }
    else {
      log.warn('Cannot send signal: not connected')
    }
  }

  private initializeAPIClients(ready: SatoriReadyBody): void {
    const apiBaseUrl = this.config.apiBaseUrl || this.config.url.replace('/v1/events', '').replace('ws://', 'http://').replace('wss://', 'https://')

    for (const login of ready.logins) {
      if (login.platform && login.self_id) {
        const key = `${login.platform}:${login.self_id}`
        this.apiClients.set(key, new SatoriAPI({
          baseUrl: apiBaseUrl,
          token: this.config.token,
          platform: login.platform,
          selfId: login.self_id,
        }))
        log.log(`Initialized API client for ${key}`)
      }
    }
  }

  // Public API for sending messages
  async sendMessage(platform: string, selfId: string, channelId: string, content: string): Promise<void> {
    const key = `${platform}:${selfId}`
    const api = this.apiClients.get(key)

    if (!api) {
      log.error(`No API client found for ${key}`)
      return
    }

    try {
      await api.sendMessage(channelId, content)
      log.log(`Message sent to channel ${channelId}`)
    }
    catch (error) {
      log.withError(error as Error).error('Failed to send message')
    }
  }

  // Event subscription
  on(eventType: string, handler: (event: SatoriEvent) => void | Promise<void>): void {
    let handlers = this.eventHandlers.get(eventType)
    if (!handlers) {
      handlers = new Set()
      this.eventHandlers.set(eventType, handlers)
    }
    handlers.add(handler)
  }

  off(eventType: string, handler?: (event: SatoriEvent) => void | Promise<void>): void {
    const handlers = this.eventHandlers.get(eventType)
    if (!handlers) {
      return
    }

    if (handler) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        this.eventHandlers.delete(eventType)
      }
    }
    else {
      this.eventHandlers.delete(eventType)
    }
  }

  onReady(handler: (logins: SatoriReadyBody) => void | Promise<void>): void {
    this.readyHandler = handler
  }

  disconnect(): void {
    this.shouldReconnect = false
    this.stopHeartbeat()

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = undefined
    }

    if (this.ws) {
      this.ws.close()
      this.ws = undefined
    }

    this.connected = false
    log.log('Disconnected from Satori server')
  }

  isConnected(): boolean {
    return this.connected
  }
}
