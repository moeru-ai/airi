import type { Buffer } from 'node:buffer'

import { randomUUID } from 'node:crypto'

import WebSocket from 'ws'

import { useLogg } from '@guiiai/logg'

import { loadDeviceIdentity, signChallenge } from './ed25519-auth'

const log = useLogg('OpenClaw').useGlobalConfig()

interface OpenClawOptions {
  gatewayUrl: string
  token: string
  sessionKey: string
}

interface PendingRPC {
  resolve: (value: string) => void
  reject: (reason: Error) => void
  timer: ReturnType<typeof setTimeout>
}

export class OpenClawClient {
  private ws: WebSocket | null = null
  private options: OpenClawOptions
  private connected = false
  private pendingRPCs = new Map<string, PendingRPC>()
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private identity = loadDeviceIdentity()

  constructor(options: OpenClawOptions) {
    this.options = options
  }

  get isConnected(): boolean {
    return this.connected
  }

  async connect(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(this.options.gatewayUrl)
      this.ws = ws

      const timeout = setTimeout(() => {
        reject(new Error('OpenClaw connection timeout'))
        ws.close()
      }, 15_000)

      ws.on('open', () => {
        log.log('WebSocket connected to OpenClaw Gateway')
      })

      ws.on('message', (raw: Buffer) => {
        let msg: any
        try {
          msg = JSON.parse(raw.toString('utf-8'))
        }
        catch {
          log.warn('Non-JSON message from OpenClaw')
          return
        }

        if (msg.type === 'connect.challenge') {
          this.handleChallenge(msg)
        }
        else if (msg.type === 'hello-ok') {
          clearTimeout(timeout)
          this.connected = true
          log.log('OpenClaw handshake complete')
          resolve()
        }
        else if (msg.type === 'rpc.response') {
          this.handleRPCResponse(msg)
        }
        else if (msg.type === 'error') {
          log.withError(msg).error('OpenClaw error')
        }
      })

      ws.on('error', (err) => {
        clearTimeout(timeout)
        log.withError(err).error('OpenClaw WebSocket error')
        reject(err)
      })

      ws.on('close', () => {
        this.connected = false
        log.log('OpenClaw WebSocket closed')
        this.scheduleReconnect()
      })
    })
  }

  private handleChallenge(msg: any) {
    const nonce = msg.nonce || msg.payload?.nonce
    if (!nonce) {
      log.error('Challenge missing nonce')
      return
    }

    const signature = signChallenge(this.identity, nonce, this.options.token)

    this.send({
      type: 'connect',
      deviceId: this.identity.deviceId,
      publicKey: this.identity.publicKey,
      signature,
      token: this.options.token,
      sessionKey: this.options.sessionKey,
      clientType: 'gateway-client',
      platform: 'darwin',
    })
  }

  private handleRPCResponse(msg: any) {
    const id = msg.id || msg.requestId
    const pending = this.pendingRPCs.get(id)
    if (!pending)
      return

    this.pendingRPCs.delete(id)
    clearTimeout(pending.timer)

    if (msg.error) {
      pending.reject(new Error(msg.error.message || 'RPC error'))
    }
    else {
      const text = msg.result?.text || msg.result?.content || JSON.stringify(msg.result)
      pending.resolve(text)
    }
  }

  async chatSend(message: string): Promise<string> {
    if (!this.connected || !this.ws) {
      throw new Error('OpenClaw not connected')
    }

    const id = randomUUID()

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRPCs.delete(id)
        reject(new Error('OpenClaw RPC timeout'))
      }, 30_000)

      this.pendingRPCs.set(id, { resolve, reject, timer })

      this.send({
        type: 'rpc.request',
        id,
        method: 'chat.send',
        params: {
          sessionKey: this.options.sessionKey,
          message,
        },
      })
    })
  }

  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    for (const [id, pending] of this.pendingRPCs) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Disconnected'))
      this.pendingRPCs.delete(id)
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.connected = false
  }

  private send(data: unknown): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data))
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer)
      return

    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null
      log.log('Attempting OpenClaw reconnect...')
      try {
        await this.connect()
      }
      catch (err) {
        log.withError(err).error('OpenClaw reconnect failed')
      }
    }, 5_000)
  }
}
