/**
 * Pure formatting helpers for the local web-rwkv chat provider: turning
 * OpenAI-style chat messages into an RWKV "World" prompt, and turning generated
 * text into OpenAI-compatible `/chat/completions` response shapes (so the
 * provider's fake `fetch` matches what `streamText`/`generateText` expect).
 *
 * Kept DOM-free and side-effect-free for direct unit testing.
 */

/** Minimal chat message shape (a subset of the OpenAI request). */
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | string
  /** Text, or OpenAI multimodal content parts (only text parts are used). */
  content: string | Array<{ type?: string, text?: string }> | null
}

/**
 * Clean a turn's text per the RWKV-7 G1 template guidance: normalise CRLF,
 * collapse runs of blank lines to a single newline, and trim. The template's own
 * `"\n\n"` separators are added between turns afterward.
 *
 * Before:
 * - `"hi\r\n\n\n  there  "`
 *
 * After:
 * - `"hi\nthere"`
 */
function cleanTurn(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\n{2,}/g, '\n').trim()
}

/** Flatten OpenAI message content (string or text parts) to a plain string. */
function messageText(content: ChatMessage['content']): string {
  if (typeof content === 'string')
    return content
  if (Array.isArray(content))
    return content.map(part => (typeof part?.text === 'string' ? part.text : '')).join('')
  return ''
}

/**
 * Build an RWKV "World" chat prompt from OpenAI-style messages.
 *
 * Use when:
 * - The web-rwkv provider needs to feed a chat history to the model.
 *
 * Expects:
 * - Messages in chronological order. `system`/`user`/`assistant` roles map to
 *   `System:` / `User:` / `Assistant:` turns separated by blank lines.
 *
 * Returns:
 * - The prompt string, always ending with the fake-think assistant opener
 *   `"Assistant: <think></think"` so the model generates the next assistant turn
 *   in RWKV-7 G1 reasoning format (see below).
 *
 * Before:
 * - `[{role:'user', content:'Hi'}]`
 *
 * After:
 * - `"User: Hi\n\nAssistant: <think></think"`
 */
export function buildRwkvPrompt(messages: ChatMessage[]): string {
  const parts: string[] = []
  for (const message of messages) {
    const text = cleanTurn(messageText(message.content))
    if (message.role === 'system') {
      if (text)
        parts.push(`System: ${text}`)
    }
    else if (message.role === 'assistant') {
      parts.push(`Assistant: ${text}`)
    }
    else {
      // Treat user (and any unknown role) as a User turn.
      if (text)
        parts.push(`User: ${text}`)
    }
  }
  // Fake-think prefill (RWKV-7 G1's "highly recommended" reasoning prompt): seed
  // the assistant turn with a closed, *empty* <think> block so the model stays in
  // the reasoning-trained format — which improves answers — but skips an actual
  // chain-of-thought and replies directly. The trailing `>` is intentionally
  // omitted (the prompt ends at `</think`); the model emits it as its first output
  // token, which createThinkPrefixStripper() drops from the response.
  // https://huggingface.co/DanielClough/rwkv7-g1-safetensors (BlinkDL RWKV-7 G1)
  parts.push('Assistant: <think></think')
  return parts.join('\n\n')
}

/**
 * Strip the leftover think-close the model emits after the fake-think prefill.
 *
 * Use when:
 * - Post-processing web-rwkv output (streamed or whole) produced from a prompt
 *   built by {@link buildRwkvPrompt}, whose assistant turn ends at `<think></think`.
 *
 * Expects:
 * - Chunks in output order. The model's first token is the `>` that closes the
 *   prefilled empty think block, usually followed by blank lines before the answer.
 *
 * Returns:
 * - A stateful, streaming-safe transform. It buffers while everything seen so far
 *   is still the prefix (a single leading `>` and surrounding whitespace), emits
 *   the remainder once real content arrives, then passes later chunks through
 *   unchanged. Feed the whole text in one call for the non-streamed path.
 *
 * Before:
 * - `">\n\nThe answer is 42."`
 *
 * After:
 * - `"The answer is 42."`
 */
export function createThinkPrefixStripper(): (chunk: string) => string {
  let flushed = false
  let buffer = ''
  return (chunk: string) => {
    if (flushed)
      return chunk
    buffer += chunk
    // Leading optional `>` (the close of the prefilled empty think block) plus any
    // surrounding whitespace. While the whole buffer is still prefix, more of it
    // may be arriving across chunks — wait for the next one before emitting.
    const prefixLen = buffer.match(/^\s*>?\s*/)?.[0].length ?? 0
    if (prefixLen >= buffer.length)
      return ''
    flushed = true
    const rest = buffer.slice(prefixLen)
    buffer = ''
    return rest
  }
}

/** One streamed OpenAI `chat.completion.chunk`. */
export function openAIChatChunk(id: string, created: number, model: string, delta: { role?: string, content?: string }, finishReason: string | null): string {
  const chunk = {
    id,
    object: 'chat.completion.chunk',
    created,
    model,
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  }
  return `data: ${JSON.stringify(chunk)}\n\n`
}

/** Terminal SSE sentinel for an OpenAI stream. */
export const SSE_DONE = 'data: [DONE]\n\n'

/** A non-streamed OpenAI `chat.completion` response body. */
export function openAIChatCompletion(id: string, created: number, model: string, content: string, promptTokens: number, completionTokens: number): string {
  return JSON.stringify({
    id,
    object: 'chat.completion',
    created,
    model,
    choices: [{ index: 0, message: { role: 'assistant', content }, finish_reason: 'stop' }],
    usage: {
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
    },
  })
}
