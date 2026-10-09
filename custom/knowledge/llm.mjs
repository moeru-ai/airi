// Claude calls for the background work (document profiles, vision, wiki).
// It uses the official SDK, which retries 429, 5xx, and connection errors itself.

import Anthropic from '@anthropic-ai/sdk'

const MAX_RETRIES = 4
const REQUEST_TIMEOUT_MS = 10 * 60 * 1000
const DEFAULT_MAX_TOKENS = 16_000
const MAX_CONTINUATIONS = 2
// Server-side refusal fallback. The skill guidance enables it by default for Sonnet 5.5, Opus 5.5, and Fable 5.1.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01'
const FALLBACK_MODELS = /^claude-(?:sonnet-5-5|opus-5-5|opus-5|fable-5-1)$/
const CONTINUE_PROMPT = 'Câu trả lời trước bị cắt vì giới hạn độ dài. Viết tiếp đúng từ chỗ dừng, không lặp lại phần đã viết, không thêm lời dẫn.'

function textOf(message) {
  return message.content.filter(block => block.type === 'text').map(block => block.text).join('')
}

/**
 * Creates the LLM helper. Returns undefined without an API key, so vision and wiki stay off.
 * `client` can be injected for tests.
 */
export function createLlm({ apiKey, client } = {}) {
  if (!client && !apiKey)
    return undefined
  const anthropic = client ?? new Anthropic({ apiKey, maxRetries: MAX_RETRIES, timeout: REQUEST_TIMEOUT_MS })

  function send(params) {
    if (FALLBACK_MODELS.test(params.model))
      return anthropic.beta.messages.stream({ ...params, betas: [FALLBACK_BETA], fallbacks: 'default' }).finalMessage()
    return anthropic.messages.stream(params).finalMessage()
  }

  /**
   * Runs one prompt.
   * - `system`: static rules, cached across calls (put nothing variable here).
   * - `content`: the user turn, a string or content blocks (for example images).
   * - `schema`: a JSON schema. When set, the reply is parsed and returned as `json`.
   * Returns `{ text, json?, usage }`. Throws on a refusal.
   */
  return async function complete({ model, system, content, schema, effort = 'low', maxTokens = DEFAULT_MAX_TOKENS }) {
    const messages = [{ role: 'user', content }]
    const usage = { input: 0, output: 0, cacheRead: 0 }
    let text = ''
    for (let round = 0; ; round++) {
      const message = await send({
        model,
        max_tokens: maxTokens,
        system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
        messages,
        output_config: { effort, ...(schema ? { format: { type: 'json_schema', schema } } : {}) },
      })
      usage.input += message.usage?.input_tokens ?? 0
      usage.output += message.usage?.output_tokens ?? 0
      usage.cacheRead += message.usage?.cache_read_input_tokens ?? 0
      if (message.stop_reason === 'refusal')
        throw new Error(`Claude từ chối yêu cầu (${message.stop_details?.category ?? 'không rõ lý do'}).`)
      text += textOf(message)
      // A JSON reply cut in half cannot be continued safely. Raise the limit instead.
      if (message.stop_reason !== 'max_tokens' || schema || round >= MAX_CONTINUATIONS)
        break
      messages.push({ role: 'assistant', content: textOf(message) }, { role: 'user', content: CONTINUE_PROMPT })
    }
    return { text, json: schema ? JSON.parse(text) : undefined, usage }
  }
}
