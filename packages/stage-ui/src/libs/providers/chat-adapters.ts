import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { Message } from '@xsai/shared-chat'

import { errorMessageFrom } from '@moeru/std'

import { fetchNanobot } from './providers/nanobot/fetch'
import { buildNanobotSessionId, resolveNanobotApiBaseUrl, resolveNanobotHealthUrl } from './providers/nanobot/shared'
import { buildOpenClawSessionHeaders } from './providers/openclaw/shared'

export interface ChatProviderAdapterRequestContext {
  activeSessionId?: string
  providerConfig: Record<string, unknown>
  providerId?: string
  sessionId: string
}

export interface ChatProviderAdapterStreamContext {
  abortSignal?: AbortSignal
  chatProvider: ChatProvider
  headers?: Record<string, string>
  messages: Message[]
  model: string
  onText: (text: string) => Promise<void> | void
  providerConfig: Record<string, unknown>
  providerId?: string
  sessionId: string
}

function resolveAiriPlatform() {
  const hasDesktopPlatform = typeof window !== 'undefined' && 'platform' in window && typeof window.platform === 'string'
  return hasDesktopPlatform ? 'desktop' : 'web'
}

function extractLatestUserText(messages: Message[]): string {
  const latestUserMessage = [...messages].reverse().find(message => message.role === 'user')
  if (!latestUserMessage) {
    throw new Error('Nanobot adapter requires at least one user message.')
  }

  const content = latestUserMessage.content
  if (typeof content === 'string') {
    const trimmed = content.trim()
    if (!trimmed) {
      throw new Error('Nanobot adapter received an empty user message.')
    }

    return trimmed
  }

  if (!Array.isArray(content)) {
    throw new TypeError('Nanobot adapter only supports plain text user messages.')
  }

  if (content.some(part => part?.type === 'image_url')) {
    throw new Error('Nanobot adapter does not support image attachments yet.')
  }

  const text = content
    .map(part => ('text' in part && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim()

  if (!text) {
    throw new Error('Nanobot adapter only supports plain text user messages.')
  }

  return text
}

async function runNanobotHealthCheck(baseUrl: string, abortSignal?: AbortSignal) {
  let timeout: ReturnType<typeof setTimeout> | undefined
  const timeoutController = new AbortController()
  const combinedSignal = abortSignal
    ? AbortSignal.any([abortSignal, timeoutController.signal])
    : timeoutController.signal

  try {
    timeout = setTimeout(() => timeoutController.abort(), 10_000)
    const response = await fetchNanobot(resolveNanobotHealthUrl(baseUrl), {
      method: 'GET',
      signal: combinedSignal,
    })

    if (!response.ok) {
      throw new Error(`Nanobot health check failed with HTTP ${response.status}.`)
    }
  }
  catch (error) {
    const message = errorMessageFrom(error) ?? 'Unknown health check error.'
    throw new Error(`Nanobot API is unavailable. Health check to ${resolveNanobotHealthUrl(baseUrl)} failed: ${message}`)
  }
  finally {
    if (timeout) {
      clearTimeout(timeout)
    }
  }
}

async function streamWithNanobotAdapter(context: ChatProviderAdapterStreamContext) {
  const baseUrl = resolveNanobotApiBaseUrl(typeof context.providerConfig.baseUrl === 'string' ? context.providerConfig.baseUrl : undefined)
  const apiKey = typeof context.providerConfig.apiKey === 'string' && context.providerConfig.apiKey.trim()
    ? context.providerConfig.apiKey.trim()
    : 'dummy'
  const model = context.model.trim() || (typeof context.providerConfig.model === 'string' ? context.providerConfig.model.trim() : '')

  if (!model) {
    throw new Error('Nanobot model is not configured. Set a model in provider settings or choose one in Consciousness.')
  }

  await runNanobotHealthCheck(baseUrl, context.abortSignal)

  const sessionId = buildNanobotSessionId({
    fallbackSessionId: context.sessionId,
    platform: resolveAiriPlatform(),
    sessionId: typeof context.providerConfig.sessionId === 'string' ? context.providerConfig.sessionId : undefined,
    sessionIdStrategy: context.providerConfig.sessionIdStrategy === 'manual' ? 'manual' : 'auto',
  })

  const response = await fetchNanobot(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...context.headers,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'user',
          content: extractLatestUserText(context.messages),
        },
      ],
      session_id: sessionId,
    }),
    signal: context.abortSignal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => '')
    throw new Error(`Nanobot chat request failed with HTTP ${response.status}${errorText ? `: ${errorText}` : '.'}`)
  }

  const payload = await response.json().catch(() => null) as any
  const content = payload?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    throw new TypeError('Nanobot returned an invalid response payload: expected `choices[0].message.content` to be a string.')
  }

  await context.onText(content)
}

export function buildProviderRequestHeaders(context: ChatProviderAdapterRequestContext): Record<string, string> {
  if (context.providerId === 'openclaw') {
    const headers = buildOpenClawSessionHeaders({
      activeSessionId: context.activeSessionId,
      fallbackSessionId: context.sessionId,
      sessionKey: typeof context.providerConfig.sessionKey === 'string' ? context.providerConfig.sessionKey : undefined,
      sessionStrategy: context.providerConfig.sessionStrategy === 'manual' ? 'manual' : 'auto',
    })

    const underlyingModel = typeof context.providerConfig.underlyingModel === 'string'
      ? context.providerConfig.underlyingModel.trim()
      : ''
    if (underlyingModel) {
      headers['x-openclaw-model'] = underlyingModel
    }

    return headers
  }

  return {}
}

export function providerHandlesStreaming(providerId?: string): boolean {
  return providerId === 'nanobot'
}

export async function streamThroughProviderAdapter(context: ChatProviderAdapterStreamContext): Promise<boolean> {
  if (context.providerId === 'nanobot') {
    await streamWithNanobotAdapter(context)
    return true
  }

  return false
}
