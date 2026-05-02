import type { Peer } from 'crossws'

import { checkOllamaHealth } from '@proj-airi/visual-chat-model-minicpmo'
import { createError, createRouter, defineEventHandler, defineWebSocketHandler, readBody } from 'h3'

import { sanitizeModelOutputText } from './sanitize-output'

interface OllamaLiteConfig {
  baseUrl: string
  model: string
}

interface InferenceRequestBody {
  image?: string
  prompt?: string
  system?: string
  history?: Array<{
    role?: string
    content?: string
  }>
}

interface OllamaChatStreamChunk {
  message?: {
    content?: string
  }
  done?: boolean
  total_duration?: number
  eval_count?: number
  error?: string
}

const DEFAULT_PROMPT = 'Describe what you observe in the current scene. Use the latest frame and recent conversation. Be concise and natural.'
const DEFAULT_SYSTEM_PROMPT = 'You are AIRI in a lightweight multimodal session. Use the most recent frame when available, keep context across turns, and answer naturally.'
const NDJSON_CONTENT_TYPE = 'application/x-ndjson; charset=utf-8'
const TRAILING_SLASH_PATTERN = /\/$/

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(TRAILING_SLASH_PATTERN, '')
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function buildMessages(body: InferenceRequestBody) {
  const prompt = body.prompt?.trim() || DEFAULT_PROMPT
  const userMessage: {
    role: 'user'
    content: string
    images?: string[]
  } = {
    role: 'user',
    content: prompt,
  }

  if (body.image)
    userMessage.images = [body.image]

  const messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string
    images?: string[]
  }> = [
    {
      role: 'system',
      content: body.system?.trim() || DEFAULT_SYSTEM_PROMPT,
    },
  ]

  if (Array.isArray(body.history)) {
    for (const message of body.history) {
      if ((message?.role === 'user' || message?.role === 'assistant') && message.content?.trim()) {
        messages.push({
          role: message.role,
          content: message.content.trim(),
        })
      }
    }
  }

  messages.push(userMessage)
  return messages
}

function encodeNdjsonLine(payload: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(payload)}\n`)
}

async function readUpstreamText(response: Response): Promise<string> {
  return response.text().catch(() => response.statusText)
}

async function readOllamaChunk(data: Uint8Array): Promise<string> {
  return new TextDecoder().decode(data)
}

function createInferenceStream(
  config: OllamaLiteConfig,
  body: InferenceRequestBody,
): ReadableStream<Uint8Array> {
  const model = config.model

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        controller.enqueue(encodeNdjsonLine({
          type: 'start',
          model,
        }))

        const response = await fetch(`${normalizeBaseUrl(config.baseUrl)}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: buildMessages(body),
            stream: true,
          }),
        })

        if (!response.ok)
          throw new Error(await readUpstreamText(response))
        if (!response.body)
          throw new Error('Ollama stream did not return a readable body.')

        const reader = response.body.getReader()
        let buffer = ''
        let rawAccumulatedText = ''
        let sanitizedAccumulatedText = ''

        while (true) {
          const { done, value } = await reader.read()
          if (done)
            break

          buffer += await readOllamaChunk(value)
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed)
              continue

            const chunk = JSON.parse(trimmed) as OllamaChatStreamChunk
            if (chunk.error)
              throw new Error(chunk.error)

            const rawDelta = chunk.message?.content ?? ''
            if (rawDelta) {
              rawAccumulatedText = `${rawAccumulatedText}${rawDelta}`
              const nextSanitizedText = sanitizeModelOutputText(rawAccumulatedText)
              const delta = nextSanitizedText.startsWith(sanitizedAccumulatedText)
                ? nextSanitizedText.slice(sanitizedAccumulatedText.length)
                : nextSanitizedText

              sanitizedAccumulatedText = nextSanitizedText
              controller.enqueue(encodeNdjsonLine({
                type: 'delta',
                delta,
                text: sanitizedAccumulatedText,
                model,
              }))
            }

            if (chunk.done) {
              sanitizedAccumulatedText = sanitizeModelOutputText(chunk.message?.content ?? '') || sanitizedAccumulatedText
              controller.enqueue(encodeNdjsonLine({
                type: 'done',
                text: sanitizedAccumulatedText,
                durationMs: chunk.total_duration ? Math.round(chunk.total_duration / 1_000_000) : 0,
                evalTokens: chunk.eval_count ?? 0,
                model,
              }))
            }
          }
        }

        if (buffer.trim()) {
          const chunk = JSON.parse(buffer.trim()) as OllamaChatStreamChunk
          if (chunk.error)
            throw new Error(chunk.error)

          const rawDelta = chunk.message?.content ?? ''
          if (rawDelta) {
            rawAccumulatedText = `${rawAccumulatedText}${rawDelta}`
            const nextSanitizedText = sanitizeModelOutputText(rawAccumulatedText)
            const delta = nextSanitizedText.startsWith(sanitizedAccumulatedText)
              ? nextSanitizedText.slice(sanitizedAccumulatedText.length)
              : nextSanitizedText

            sanitizedAccumulatedText = nextSanitizedText
            controller.enqueue(encodeNdjsonLine({
              type: 'delta',
              delta,
              text: sanitizedAccumulatedText,
              model,
            }))
          }

          sanitizedAccumulatedText = sanitizeModelOutputText(chunk.message?.content ?? '') || sanitizedAccumulatedText
          controller.enqueue(encodeNdjsonLine({
            type: 'done',
            text: sanitizedAccumulatedText,
            durationMs: chunk.total_duration ? Math.round(chunk.total_duration / 1_000_000) : 0,
            evalTokens: chunk.eval_count ?? 0,
            model,
          }))
        }

        controller.close()
      }
      catch (error) {
        controller.enqueue(encodeNdjsonLine({
          type: 'error',
          error: errorMessage(error),
          model,
        }))
        controller.close()
      }
    },
  })
}

function createUnsupportedDuplexHandler() {
  return defineWebSocketHandler({
    open(peer: Peer) {
      peer.send(JSON.stringify({
        type: 'error',
        error: 'Native full-duplex websocket is not available in ollama-lite mode.',
      }))
      peer.close()
    },
  })
}

export function createOllamaLiteRouter(config: OllamaLiteConfig) {
  const router = createRouter()

  router.get('/health', defineEventHandler(async () => {
    try {
      const ok = await checkOllamaHealth(config.baseUrl)
      if (!ok) {
        return {
          ok: false,
          status: 'offline',
          backendKind: 'ollama',
          model: config.model,
          upstreamBaseUrl: config.baseUrl,
          features: ['vision-stream', 'session-history', 'text-input', 'scene-memory'],
        }
      }

      return {
        ok: true,
        status: 'running',
        backendKind: 'ollama',
        model: config.model,
        upstreamBaseUrl: config.baseUrl,
        fixedModel: true,
        features: ['vision-stream', 'session-history', 'text-input', 'scene-memory'],
      }
    }
    catch (error) {
      return {
        ok: false,
        status: 'offline',
        backendKind: 'ollama',
        model: config.model,
        upstreamBaseUrl: config.baseUrl,
        fixedModel: true,
        error: errorMessage(error),
        features: ['vision-stream', 'session-history', 'text-input', 'scene-memory'],
      }
    }
  }))

  router.post('/infer-stream', defineEventHandler(async (event) => {
    const body = await readBody(event) as InferenceRequestBody
    return new Response(createInferenceStream(config, body), {
      headers: {
        'Content-Type': NDJSON_CONTENT_TYPE,
        'Cache-Control': 'no-store',
      },
    })
  }))

  router.all('/ws/duplex', defineEventHandler(() => {
    throw createError({
      statusCode: 501,
      statusMessage: 'Native full-duplex websocket is not available in ollama-lite mode.',
    })
  }))

  return {
    router,
    duplexWsHandler: createUnsupportedDuplexHandler(),
  }
}
