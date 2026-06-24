/**
 * AIRI IPC — Unix Domain Socket Client Transport
 *
 * Client-side transport implementation using Node.js `net` module.
 * Connects to the daemon's Unix domain socket (or TCP localhost on Windows).
 *
 * Implements automatic reconnection with exponential backoff and
 * heartbeat/ping for connection liveness detection.
 */

import { connect as netConnect, type Socket } from 'node:net'

const _logger = (..._a: unknown[]) => void 0

import type { IpcMessage } from '../protocol.js'
import type { IpcClientTransport, IpcConnectionState, IpcMessageHandler, IpcStateHandler } from '../transport.js'
import { generateId } from '../transport.js'

// ── Types ──────────────────────────────────────────────────────────────

type DisconnectHandler = () => void

// ── Constants ─────────────────────────────────────────────────────────

const HEADER_SIZE = 4
const MAX_MESSAGE_SIZE = 1024 * 1024 // 1 MB

const DEFAULT_HEARTBEAT_INTERVAL = 30_000 // 30 seconds
const DEFAULT_RECONNECT_BASE_DELAY = 1_000 // 1 second
const DEFAULT_RECONNECT_MAX_DELAY = 30_000 // 30 seconds

// ── Options ────────────────────────────────────────────────────────────

export interface LocalSocketClientOptions {
  /** Socket path or TCP address. @default platform default */
  socketPath?: string

  /** Enable automatic reconnection. @default true */
  autoReconnect?: boolean

  /** Base delay (ms) for exponential backoff. @default 1000 */
  reconnectBaseDelay?: number

  /** Maximum delay (ms) between reconnection attempts. @default 30000 */
  reconnectMaxDelay?: number

  /** Heartbeat interval (ms). Set to 0 to disable. @default 30000 */
  heartbeatInterval?: number
}

// ── Client implementation ──────────────────────────────────────────────

/**
 * Unix domain socket client transport.
 *
 * Connects to the daemon's server transport. Supports automatic
 * reconnection and heartbeat keepalive.
 */
export class LocalSocketClientTransport implements IpcClientTransport {
  private _state: IpcConnectionState = 'idle'
  private socket: Socket | null = null
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null
  private intentionallyDisconnected = false

  // Handlers
  private readonly messageHandlers = new Set<IpcMessageHandler>()
  private readonly disconnectHandlers = new Set<DisconnectHandler>()
  private readonly stateHandlers = new Set<IpcStateHandler>()

  /** Socket path or TCP address. */
  readonly socketPath: string
  readonly autoReconnect: boolean
  readonly reconnectBaseDelay: number
  readonly reconnectMaxDelay: number
  readonly heartbeatInterval: number

  constructor(options: LocalSocketClientOptions = {}) {
    this.socketPath = options.socketPath ?? getDefaultSocketPath()
    this.autoReconnect = options.autoReconnect ?? true
    this.reconnectBaseDelay = options.reconnectBaseDelay ?? DEFAULT_RECONNECT_BASE_DELAY
    this.reconnectMaxDelay = options.reconnectMaxDelay ?? DEFAULT_RECONNECT_MAX_DELAY
    this.heartbeatInterval = options.heartbeatInterval ?? DEFAULT_HEARTBEAT_INTERVAL
  }

  // ── IpcClientTransport ─────────────────────────────────────────────

  get state(): IpcConnectionState {
    return this._state
  }

  async connect(): Promise<void> {
    if (this._state === 'connected') return

    this.intentionallyDisconnected = false
    this.setState('connecting')

    await this.doConnect()
  }

  disconnect(): Promise<void> {
    if (this._state === 'idle' || this._state === 'disconnected') return Promise.resolve()

    this.intentionallyDisconnected = true
    this.setState('disconnecting')

    this.stopHeartbeat()
    this.cancelReconnect()

    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }

    this.setState('disconnected')
    return Promise.resolve()
  }

  send(message: IpcMessage): Promise<void> {
    if (!this.socket || this._state !== 'connected') {
      throw new Error(`Cannot send: transport is ${this._state}.`)
    }

    const data = LocalSocketClientTransport.encodeMessage(message)
    return new Promise<void>((resolve, reject) => {
      this.socket!.write(data, (err) => {
        if (err) reject(err)
        else resolve()
      })
    })
  }

  onMessage(handler: IpcMessageHandler): () => void {
    this.messageHandlers.add(handler)
    return () => {
      this.messageHandlers.delete(handler)
    }
  }

  onDisconnect(handler: DisconnectHandler): () => void {
    this.disconnectHandlers.add(handler)
    return () => {
      this.disconnectHandlers.delete(handler)
    }
  }

  onStateChange(handler: IpcStateHandler): () => void {
    this.stateHandlers.add(handler)
    return () => {
      this.stateHandlers.delete(handler)
    }
  }

  // ── Private: connection ────────────────────────────────────────────

  private doConnect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const isTcp = this.socketPath.includes(':') && !this.socketPath.startsWith('/')

      const socket = isTcp
        ? netConnect({ port: parseInt(this.socketPath.split(':')[1]), host: this.socketPath.split(':')[0] })
        : netConnect(this.socketPath)

      socket.on('connect', () => {
        this.socket = socket
        this.reconnectAttempts = 0
        this.setState('connected')
        this.setupSocket(socket)
        this.startHeartbeat()
        resolve()
      })

      socket.on('error', (err) => {
        this.setState('error', err.message)
        socket.destroy()
        reject(err)
      })
    })
  }

  private setupSocket(socket: Socket): void {
    let buffer = Buffer.alloc(0)
    let expectedLength: number | null = null

    socket.on('data', (chunk: Buffer) => {
      buffer = Buffer.concat([buffer, chunk])
     	expectedLength = this.processSocketData(buffer, socket, expectedLength)
    })

    socket.on('close', () => {
      this.handleSocketClose()
    })

    socket.on('error', (err) => {
      console.error('[LocalSocketClient] Socket error:', err.message)
    })
  }

  private processSocketData(buffer: Buffer, socket: Socket, expectedLength: number | null): number | null {
    let currentExpected = expectedLength
    let currentBuffer = buffer

    while (true) {
      if (currentExpected === null) {
        if (currentBuffer.length < HEADER_SIZE) return null

        currentExpected = currentBuffer.readUInt32BE(0)

        if (currentExpected > MAX_MESSAGE_SIZE) {
          _logger(`[LocalSocketClient] Message too large (${currentExpected} bytes), disconnecting.`)
          socket.destroy()
          return null
        }

        currentBuffer = currentBuffer.subarray(HEADER_SIZE)
      }

      if (currentBuffer.length < currentExpected) return currentExpected

      const messageBytes = currentBuffer.subarray(0, currentExpected)
      currentBuffer = currentBuffer.subarray(currentExpected)
      currentExpected = null

      this.handleRawMessage(messageBytes)
    }
  }

  private handleRawMessage(messageBytes: Buffer): void {
    try {
      const json = messageBytes.toString('utf-8')
      const parsed = JSON.parse(json) as IpcMessage

      if (parsed.type === 'ping') {
        this.send({
          id: generateId(),
          type: 'pong',
          timestamp: new Date().toISOString(),
          correlationId: parsed.id,
        }).catch(() => {
          // Best-effort: ignore send errors on pong.
        })
      }

      for (const handler of this.messageHandlers) {
        try {
          handler(parsed)
        } catch (error) {
          _logger('[LocalSocketClient] Message handler threw:', error)
        }
      }
    } catch (error) {
      _logger(
        '[LocalSocketClient] Failed to parse message:',
        error instanceof Error ? error.message : String(error),
      )
    }
  }

  private handleSocketClose(): void {
    this.socket = null
    this.stopHeartbeat()

    for (const handler of this.disconnectHandlers) {
      try {
        handler()
      } catch (error) {
        _logger('[LocalSocketClient] Disconnect handler threw:', error)
      }
    }

    if (!this.intentionallyDisconnected && this.autoReconnect) {
      this.scheduleReconnect()
    } else {
      this.setState('disconnected')
    }
  }

  // ── Private: reconnection ──────────────────────────────────────────

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return

    this.setState('reconnecting')

    const delay = Math.min(this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts), this.reconnectMaxDelay)
    this.reconnectAttempts++

    console.log(`[LocalSocketClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})...`)

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.doConnect().catch(() => {
        // Reconnect failed — schedule another attempt.
        this.scheduleReconnect()
      })
    }, delay)
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }

  // ── Private: heartbeat ─────────────────────────────────────────────

  private startHeartbeat(): void {
    if (this.heartbeatInterval <= 0) return

    this.stopHeartbeat()
    this.heartbeatTimer = setInterval(() => {
      if (this._state === 'connected') {
        this.send({
          id: generateId(),
          type: 'ping',
          timestamp: new Date().toISOString(),
        }).catch(() => {
          // If ping fails, the socket will close and trigger reconnect.
        })
      }
    }, this.heartbeatInterval)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer as unknown as number)
      this.heartbeatTimer = null
    }
  }

  // ── Private: encoding ──────────────────────────────────────────────

  private static encodeMessage(message: IpcMessage): Buffer {
    const json = JSON.stringify(message)
    const payload = Buffer.from(json, 'utf-8')
    const header = Buffer.alloc(HEADER_SIZE)
    header.writeUInt32BE(payload.length, 0)
    return Buffer.concat([header, payload])
  }

  // ── Private: state management ──────────────────────────────────────

  private setState(state: IpcConnectionState, error?: string): void {
    this._state = state
    for (const handler of this.stateHandlers) {
      try {
        handler(state, error)
      } catch (err) {
        console.error('[LocalSocketClient] State handler threw:', err)
      }
    }
  }
}

// ── Platform detection ────────────────────────────────────────────────

function getDefaultSocketPath(): string {
  if (process.platform === 'win32') {
    return '127.0.0.1:19837'
  }

  return '/tmp/airi-daemon.sock'
}
