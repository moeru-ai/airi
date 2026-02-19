import type { AssistantMessage } from '@xsai/shared-chat'
import type WebSocket from 'ws'

import { randomUUID } from 'node:crypto'

import { useLogg } from '@guiiai/logg'
import { Client as AiriClient } from '@proj-airi/server-sdk'

import { connectGateway, sendAndWaitForReply } from './openclaw-gateway-client.js'

const log = useLogg('OpenClawBridge')

function createEventId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Send an event as plain JSON so the server (which parses with JSON) broadcasts the real event; Stage then receives type/data and dispatches. */
function sendEventAsPlainJson(
  client: AiriClient,
  type: string,
  data: Record<string, unknown>,
): void {
  const payload = {
    type,
    data,
    metadata: {
      source: { kind: 'plugin' as const, plugin: { id: 'openclaw' } },
      event: { id: createEventId() },
    },
  }
  client.sendRaw(JSON.stringify(payload))
}

export interface OpenClawBridgeConfig {
  airiUrl: string
  airiToken?: string
  gatewayWsUrl: string
  gatewayAuthToken?: string
  /** OpenClaw gateway client id (must be one of gateway protocol allowlist). Use openclaw-control-ui only when gateway allows Control UI bypass. */
  gatewayClientId?: string
  sessionKey?: string
}

export class OpenClawBridgeAdapter {
  private airiClient: AiriClient
  private gatewayWs: WebSocket | null = null
  private gatewayWsUrl: string
  private gatewayAuthToken?: string
  private sessionKey: string
  private config: OpenClawBridgeConfig

  constructor(config: OpenClawBridgeConfig) {
    this.config = config
    this.sessionKey = config.sessionKey ?? 'main'
    this.gatewayWsUrl = config.gatewayWsUrl
    this.gatewayAuthToken = config.gatewayAuthToken

    this.airiClient = new AiriClient({
      name: 'openclaw',
      url: config.airiUrl,
      token: config.airiToken,
      possibleEvents: [
        'input:text',
        'input:text:voice',
        'module:authenticate',
        'module:authenticated',
        'module:announce',
        'ui:configure',
      ],
      autoConnect: true,
      autoReconnect: true,
      maxReconnectAttempts: -1,
      onAnyMessage: (data) => {
        log.log('AIRI event received', { type: data?.type })
        // Server may broadcast a SuperJSON envelope (server parses with plain JSON); unwrap so we see input:text.
        const isEnvelope
          = data
            && typeof data === 'object'
            && data.type == null
            && 'json' in data
            && typeof (data as { json?: unknown }).json === 'object'
        const event = isEnvelope
          ? (data as { json: { type?: string, data?: Record<string, unknown> & { text?: string } } }).json
          : data
        if (isEnvelope && event?.type === 'input:text' && event.data != null) {
          void this.handleInputText(event.data as { text: string } & Record<string, unknown>)
        }
      },
    })

    this.airiClient.onEvent('input:text', async (event) => {
      await this.handleInputText(event.data as { text: string } & Record<string, unknown>)
    })
  }

  private async getGatewayWs(): Promise<WebSocket> {
    if (this.gatewayWs && this.gatewayWs.readyState === 1 /* OPEN */) {
      return this.gatewayWs
    }
    const { default: WS } = await import('ws')
    // When connecting as openclaw-control-ui, the gateway requires a valid Origin; send HTTP origin for same host so loopback check passes.
    const origin
      = this.config.gatewayClientId === 'openclaw-control-ui'
        ? this.gatewayWsUrl.replace(/^ws:/i, 'http:').replace(/^wss:/i, 'https:')
        : undefined
    const ws = new (WS as typeof import('ws'))(
      this.gatewayWsUrl,
      origin != null ? { headers: { Origin: origin } } : undefined,
    ) as WebSocket
    await new Promise<void>((resolve, reject) => {
      ws.once('open', () => resolve())
      ws.once('error', reject)
    })
    await connectGateway(ws, {
      token: this.gatewayAuthToken,
      clientId: this.config.gatewayClientId,
    })
    this.gatewayWs = ws
    ws.on('close', () => {
      this.gatewayWs = null
    })
    ws.on('error', (err) => {
      log.withError(err).warn('OpenClaw gateway WebSocket error')
    })
    return ws
  }

  private async handleInputText(inputData: Record<string, unknown> & { text: string }): Promise<void> {
    const text = inputData?.text
    log.log('input:text received', { text: typeof text === 'string' ? text.slice(0, 80) : text })
    if (typeof text !== 'string' || !text.trim()) {
      log.warn('input:text missing or empty text, skipping')
      return
    }

    const idempotencyKey = randomUUID()
    let assistantMessage: AssistantMessage

    try {
      log.log('Connecting to OpenClaw gateway and sending message...')
      const ws = await this.getGatewayWs()
      assistantMessage = await sendAndWaitForReply(ws, {
        sessionKey: this.sessionKey,
        message: text.trim(),
        idempotencyKey,
      })
    }
    catch (err) {
      log.withError(err).error('OpenClaw gateway sendAndWaitForReply failed')
      return
    }

    log.log('Gateway reply received, sending stream events to AIRI')
    const inputText = text.trim()
    const content = typeof assistantMessage.content === 'string' ? assistantMessage.content : ''
    const sessionId = this.sessionKey

    // ChatStreamEventContext shape AIRI expects (see stage-ui types/chat.ts)
    const context = {
      message: { role: 'user' as const, content: inputText },
      contexts: {} as Record<string, unknown[]>,
      composedMessage: [] as unknown[],
      input: { type: 'input:text' as const, data: inputData },
    }

    const streamEventType = 'output:gen-ai:chat:stream'
    sendEventAsPlainJson(this.airiClient, streamEventType, {
      type: 'before-compose',
      message: inputText,
      sessionId,
      context: { message: context.message, contexts: context.contexts, input: context.input },
    })
    sendEventAsPlainJson(this.airiClient, streamEventType, {
      type: 'before-send',
      message: inputText,
      sessionId,
      context,
    })
    sendEventAsPlainJson(this.airiClient, streamEventType, {
      type: 'token-literal',
      literal: content,
      sessionId,
      context,
    })
    sendEventAsPlainJson(this.airiClient, streamEventType, {
      type: 'assistant-end',
      message: content,
      sessionId,
      context,
    })

    const baseOutput = { ...inputData }
    sendEventAsPlainJson(this.airiClient, 'output:gen-ai:chat:message', {
      ...baseOutput,
      message: assistantMessage,
    })
    sendEventAsPlainJson(this.airiClient, 'output:gen-ai:chat:complete', {
      ...baseOutput,
      message: assistantMessage,
      toolCalls: [],
      usage: {
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        source: 'estimate-based',
      },
    })
  }

  async start(): Promise<void> {
    await this.airiClient.connect()
    log.log('OpenClaw bridge started; AIRI connected, gateway on demand')
  }

  async stop(): Promise<void> {
    if (this.gatewayWs) {
      this.gatewayWs.close()
      this.gatewayWs = null
    }
    this.airiClient.close()
    log.log('OpenClaw bridge stopped')
  }
}
