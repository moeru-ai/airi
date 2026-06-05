import type { ChatProvider } from '@xsai-ext/providers/utils'

import type { WebRwkvGenerateRequest } from '../../../libs/inference/contract'
import type { ChatMessage } from './format'

import { getWebRwkvAdapter } from '../../../libs/inference/adapters/web-rwkv'
import { DEFAULT_WEB_RWKV_MODEL, WEB_RWKV_SAMPLING_DEFAULTS } from '../../../libs/inference/constants'
import { buildRwkvPrompt, createThinkPrefixStripper, openAIChatChunk, openAIChatCompletion, SSE_DONE } from './format'

/**
 * Configuration captured when the provider instance is created.
 *
 * The sampling fields are provider-level defaults: each is overridden per request
 * by the matching field on the OpenAI chat body when present (e.g. `temperature`,
 * `top_p`, `top_k`, `frequency_penalty`). `penaltyDecay` has no OpenAI body field,
 * so it is provider-level only. Any field left unset falls back to
 * {@link WEB_RWKV_SAMPLING_DEFAULTS}.
 */
export interface WebRwkvProviderConfig {
  /** Model `.safetensors` URL. Defaults to {@link DEFAULT_WEB_RWKV_MODEL}. */
  model?: string
  /** Tokenizer vocab URL. Omit to use the worker's bundled RWKV World vocab. */
  vocab?: string
  /** @default WEB_RWKV_SAMPLING_DEFAULTS.temperature */
  temperature?: number
  /** @default WEB_RWKV_SAMPLING_DEFAULTS.topP */
  topP?: number
  /** Top-k truncation (`0` disables). @default WEB_RWKV_SAMPLING_DEFAULTS.topK */
  topK?: number
  /** @default WEB_RWKV_SAMPLING_DEFAULTS.maxTokens */
  maxTokens?: number
  /** @default WEB_RWKV_SAMPLING_DEFAULTS.presencePenalty */
  presencePenalty?: number
  /** RWKV count (frequency) penalty. @default WEB_RWKV_SAMPLING_DEFAULTS.countPenalty */
  countPenalty?: number
  /** @default WEB_RWKV_SAMPLING_DEFAULTS.penaltyDecay */
  penaltyDecay?: number
}

interface OpenAIChatBody {
  messages?: ChatMessage[]
  model?: string
  stream?: boolean
  temperature?: number
  top_p?: number
  /** Non-standard but widely accepted by OpenAI-compatible servers; maps to `topK`. */
  top_k?: number
  max_tokens?: number
  presence_penalty?: number
  /** OpenAI's repetition control; maps to the RWKV `countPenalty`. */
  frequency_penalty?: number
}

/**
 * Local web-rwkv (WebGPU RWKV) chat provider.
 *
 * Use when:
 * - Registering an in-browser RWKV LLM as an OpenAI-compatible `chat` provider so
 *   the existing chat/consciousness flows (`streamText`/`generateText`) drive it
 *   unchanged.
 *
 * Expects:
 * - A WebGPU-capable renderer (web-rwkv has no WASM fallback).
 *
 * Returns:
 * - A {@link ChatProvider} whose `chat()` yields an OpenAI-compatible endpoint;
 *   its `fetch` intercepts `/chat/completions`, builds an RWKV "World" prompt from
 *   the messages, and streams the in-browser model's output as SSE (or a single
 *   JSON body when `stream` is false) — see {@link getWebRwkvAdapter}.
 */
export function createWebRwkvChatProvider(config: WebRwkvProviderConfig = {}): ChatProvider {
  const defaultModelUrl = config.model || DEFAULT_WEB_RWKV_MODEL
  const vocabUrl = config.vocab || undefined

  return {
    chat: (model: string) => ({
      baseURL: 'http://web-rwkv/v1/',
      model: model || defaultModelUrl,
      headers: {},
      fetch: async (_input: RequestInfo | URL, init?: RequestInit) => {
        const body = (init?.body && typeof init.body === 'string' ? JSON.parse(init.body) : {}) as OpenAIChatBody
        const modelUrl = body.model || model || defaultModelUrl
        const prompt = buildRwkvPrompt(body.messages ?? [])

        const adapter = await getWebRwkvAdapter()
        // Load-on-demand and reload when the selected model/vocab differs from
        // what's loaded (the adapter is a singleton shared across requests).
        if (adapter.state !== 'ready' || adapter.manifest?.model !== modelUrl || adapter.manifest?.vocab !== (vocabUrl ?? '')) {
          await adapter.loadModel(modelUrl, vocabUrl, { signal: init?.signal ?? undefined })
        }

        // Per request: OpenAI body field → provider-level default → shared default.
        // penaltyDecay has no OpenAI body field, so it skips the first hop.
        const request: WebRwkvGenerateRequest = {
          prompt,
          maxTokens: body.max_tokens ?? config.maxTokens ?? WEB_RWKV_SAMPLING_DEFAULTS.maxTokens,
          temperature: body.temperature ?? config.temperature ?? WEB_RWKV_SAMPLING_DEFAULTS.temperature,
          topP: body.top_p ?? config.topP ?? WEB_RWKV_SAMPLING_DEFAULTS.topP,
          topK: body.top_k ?? config.topK ?? WEB_RWKV_SAMPLING_DEFAULTS.topK,
          presencePenalty: body.presence_penalty ?? config.presencePenalty ?? WEB_RWKV_SAMPLING_DEFAULTS.presencePenalty,
          countPenalty: body.frequency_penalty ?? config.countPenalty ?? WEB_RWKV_SAMPLING_DEFAULTS.countPenalty,
          penaltyDecay: config.penaltyDecay ?? WEB_RWKV_SAMPLING_DEFAULTS.penaltyDecay,
        }

        const id = `chatcmpl-${Date.now()}`
        const created = Math.floor(Date.now() / 1000)
        const encoder = new TextEncoder()

        if (body.stream) {
          // Drops the leftover `>` the model emits to close the fake-think prefill
          // (see buildRwkvPrompt / createThinkPrefixStripper). Stateful — one per stream.
          const stripThinkPrefix = createThinkPrefixStripper()
          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              try {
                controller.enqueue(encoder.encode(openAIChatChunk(id, created, modelUrl, { role: 'assistant' }, null)))
                await adapter.generate(request, {
                  signal: init?.signal ?? undefined,
                  onToken: (text) => {
                    const content = stripThinkPrefix(text)
                    if (content)
                      controller.enqueue(encoder.encode(openAIChatChunk(id, created, modelUrl, { content }, null)))
                  },
                })
                controller.enqueue(encoder.encode(openAIChatChunk(id, created, modelUrl, {}, 'stop')))
                controller.enqueue(encoder.encode(SSE_DONE))
                controller.close()
              }
              catch (error) {
                controller.error(error)
              }
            },
          })

          return new Response(stream, {
            status: 200,
            headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
          })
        }

        const text = await adapter.generate(request, { signal: init?.signal ?? undefined })
        // Drop the fake-think prefill's leftover `>` (see buildRwkvPrompt). Token
        // usage isn't tracked on the JS side (the worker owns tokenization), so
        // usage counts are reported as 0.
        const content = createThinkPrefixStripper()(text)
        return new Response(openAIChatCompletion(id, created, modelUrl, content, 0, 0), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    }),
  }
}
