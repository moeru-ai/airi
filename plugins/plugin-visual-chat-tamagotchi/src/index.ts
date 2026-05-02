import type { SessionAccess } from '@proj-airi/visual-chat-protocol'
import type { GatewaySessionAccess, WsEvent } from '@proj-airi/visual-chat-sdk'

import { GatewayClient, GatewayWsClient } from '@proj-airi/visual-chat-sdk'

export interface TamagotchiBridgeOptions {
  gatewayUrl: string
}

export class TamagotchiVisualChatBridge {
  private client: GatewayClient
  private wsClient: GatewayWsClient
  private sessionId: string | null = null
  private gatewayToken = ''
  private sessionAccess: SessionAccess | null = null

  constructor(private opts: TamagotchiBridgeOptions) {
    this.client = new GatewayClient({
      baseUrl: opts.gatewayUrl,
      getGatewayToken: () => this.gatewayToken,
      getSessionAccess: () => {
        if (!this.sessionAccess)
          return null
        return {
          sessionId: this.sessionAccess.session.sessionId,
          sessionToken: this.sessionAccess.sessionToken,
        } satisfies GatewaySessionAccess
      },
    })
    const wsUrl = `${opts.gatewayUrl.replace(/^http/, 'ws')}/ws`
    this.wsClient = new GatewayWsClient(wsUrl, {
      getSessionAccess: (sessionId) => {
        if (!this.sessionAccess || this.sessionAccess.session.sessionId !== sessionId)
          return null
        return {
          sessionId,
          sessionToken: this.sessionAccess.sessionToken,
        }
      },
    })
  }

  async connect(): Promise<string> {
    const bootstrap = await this.client.bootstrap()
    this.gatewayToken = bootstrap.gatewayToken
    const session = await this.client.createSession()
    this.sessionAccess = session
    this.sessionId = session.session.sessionId

    this.wsClient.connect()
    this.wsClient.subscribe(session.session.sessionId)

    return session.session.sessionId
  }

  async switchToDesktopCamera(): Promise<void> {
    if (!this.sessionId)
      return
    await this.client.switchSource(this.sessionId, undefined, 'laptop-camera')
  }

  async startScreenShare(): Promise<void> {
    if (!this.sessionId)
      return
    await this.client.switchSource(this.sessionId, undefined, 'screen-share')
  }

  async disconnect(): Promise<void> {
    if (this.sessionId) {
      await this.client.deleteSession(this.sessionId)
      this.sessionId = null
      this.sessionAccess = null
    }
    this.wsClient.disconnect()
  }

  onEvent(handler: (event: WsEvent) => void): () => void {
    return this.wsClient.on('*', handler)
  }
}
