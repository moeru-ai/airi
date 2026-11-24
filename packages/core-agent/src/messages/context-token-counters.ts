import type { ContextTokenCounter } from './context-token-usage'

interface CounterOptions {
  fetch: typeof fetch
  apiKey: string
  baseURL: string
  model: string
}

function joinUrl(baseURL: string, path: string) {
  const root = baseURL.replace(/\/$/u, '')
  return `${root}/${path.replace(/^\//u, '')}`
}

function recordOf(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' ? value as Record<string, unknown> : undefined
}

function textOf(content: unknown) {
  if (typeof content === 'string')
    return content
  if (!Array.isArray(content))
    return undefined
  const parts: string[] = []
  for (const part of content) {
    const record = recordOf(part)
    if (!record)
      return undefined
    if (typeof record.text === 'string')
      parts.push(record.text)
    else if (typeof record.url === 'string' && record.url.startsWith('data:image/'))
      return undefined
    else
      return undefined
  }
  return parts.join('')
}

function functionTools(tools: unknown) {
  if (!Array.isArray(tools))
    return undefined
  const mapped: { name: string, description: string, parameters: unknown }[] = []
  for (const tool of tools) {
    const record = recordOf(tool)
    const fn = recordOf(record?.function)
    if (record?.type === 'function' && typeof fn?.name === 'string') {
      mapped.push({
        name: fn.name,
        description: typeof fn.description === 'string' ? fn.description : '',
        parameters: fn.parameters ?? { type: 'object' },
      })
    }
  }
  return mapped.length > 0 ? mapped : undefined
}

/**
 * Builds an OpenAI Responses input-token body from a projected Responses request.
 * Chat-completions payloads return undefined so the caller keeps the local estimate.
 */
export function toOpenAiInputTokenBody(model: string, payload: unknown) {
  const record = recordOf(payload)
  if (!record || !Array.isArray(record.input))
    return undefined
  return {
    model,
    input: record.input,
    ...(record.tools === undefined ? {} : { tools: record.tools }),
  }
}

/**
 * Builds an Anthropic count-token body from projected chat messages and function tools.
 * Returns undefined when a tool result, image, or tool call cannot be represented.
 */
export function toAnthropicCountBody(model: string, payload: unknown) {
  const record = recordOf(payload)
  if (!record || !Array.isArray(record.messages))
    return undefined

  const system: string[] = []
  const messages: { role: 'user' | 'assistant', content: unknown }[] = []
  const pendingToolResults: { type: 'tool_result', tool_use_id: string, content: string }[] = []

  function flushToolResults() {
    if (pendingToolResults.length === 0)
      return
    messages.push({ role: 'user', content: [...pendingToolResults] })
    pendingToolResults.length = 0
  }

  for (const message of record.messages) {
    const item = recordOf(message)
    if (!item || typeof item.role !== 'string')
      return undefined
    if (item.role === 'system') {
      const text = textOf(item.content)
      if (text === undefined)
        return undefined
      if (text)
        system.push(text)
      continue
    }
    if (item.role === 'tool') {
      const text = textOf(item.content)
      if (text === undefined || typeof item.tool_call_id !== 'string')
        return undefined
      pendingToolResults.push({ type: 'tool_result', tool_use_id: item.tool_call_id, content: text })
      continue
    }
    flushToolResults()
    if (item.role !== 'user' && item.role !== 'assistant')
      return undefined
    const text = textOf(item.content)
    if (text === undefined)
      return undefined
    const calls = Array.isArray(item.tool_calls) ? item.tool_calls : []
    if (calls.length === 0) {
      messages.push({ role: item.role, content: text })
      continue
    }
    const content: unknown[] = []
    if (text)
      content.push({ type: 'text', text })
    for (const call of calls) {
      const callRecord = recordOf(call)
      const fn = recordOf(callRecord?.function)
      if (typeof callRecord?.id !== 'string' || typeof fn?.name !== 'string' || typeof fn.arguments !== 'string')
        return undefined
      let input: unknown = {}
      try {
        input = JSON.parse(fn.arguments) as unknown
      }
      catch {
        return undefined
      }
      content.push({ type: 'tool_use', id: callRecord.id, name: fn.name, input })
    }
    messages.push({ role: 'assistant', content })
  }
  flushToolResults()
  if (messages.length === 0)
    return undefined

  const tools = functionTools(record.tools)?.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.parameters,
  }))
  return {
    model,
    ...(system.length > 0 ? { system: system.join('\n\n') } : {}),
    messages,
    ...(tools ? { tools } : {}),
  }
}

/**
 * Builds a Gemini countTokens body from projected chat messages and function tools.
 * Returns undefined when media or a tool call cannot be represented as text.
 */
export function toGeminiCountBody(payload: unknown) {
  const anthropic = toAnthropicCountBody('unused', payload)
  if (!anthropic)
    return undefined
  const contents = (anthropic.messages as { role: string, content: unknown }[]).map((message) => {
    const text = typeof message.content === 'string'
      ? message.content
      : JSON.stringify(message.content)
    return {
      role: message.role === 'assistant' ? 'model' : 'user',
      parts: [{ text }],
    }
  })
  const tools = functionTools(recordOf(payload)?.tools)?.map(tool => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }))
  return {
    ...(typeof anthropic.system === 'string' ? { systemInstruction: { parts: [{ text: anthropic.system }] } } : {}),
    contents,
    ...(tools ? { tools: [{ functionDeclarations: tools }] } : {}),
  }
}

async function readCount(response: Response, key: string) {
  if (!response.ok)
    throw new Error(`Token count failed with HTTP ${response.status}.`)
  const body = await response.json() as Record<string, unknown>
  const value = body[key]
  if (!Number.isSafeInteger(value) || (value as number) < 0)
    throw new Error('Token count response did not include a token total.')
  return value as number
}

/** Counts a Responses payload with OpenAI `input_tokens`. Other payload shapes fail closed. */
export function createOpenAiInputTokenCounter(options: CounterOptions): ContextTokenCounter {
  return {
    capability: 'openai-responses-input-tokens',
    async countInputTokens(payload, signal) {
      const body = toOpenAiInputTokenBody(options.model, payload)
      if (!body)
        throw new Error('OpenAI input token count needs a Responses input payload.')
      const response = await options.fetch(joinUrl(options.baseURL, 'responses/input_tokens'), {
        method: 'POST',
        signal,
        headers: {
          'authorization': `Bearer ${options.apiKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      return await readCount(response, 'input_tokens')
    },
  }
}

/** Counts projected chat messages with Anthropic `count_tokens`. */
export function createAnthropicTokenCounter(options: CounterOptions): ContextTokenCounter {
  return {
    capability: 'anthropic-messages-count-tokens',
    async countInputTokens(payload, signal) {
      const body = toAnthropicCountBody(options.model, payload)
      if (!body)
        throw new Error('Anthropic token count needs representable chat messages.')
      const root = options.baseURL.replace(/\/$/u, '')
      const url = root.endsWith('/v1') ? `${root}/messages/count_tokens` : `${root}/v1/messages/count_tokens`
      const response = await options.fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'x-api-key': options.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      return await readCount(response, 'input_tokens')
    },
  }
}

/** Counts projected chat messages with Gemini `countTokens`. */
export function createGeminiTokenCounter(options: CounterOptions): ContextTokenCounter {
  return {
    capability: 'gemini-count-tokens',
    async countInputTokens(payload, signal) {
      const body = toGeminiCountBody(payload)
      if (!body)
        throw new Error('Gemini token count needs representable chat messages.')
      const root = options.baseURL.replace(/\/$/u, '')
      const url = `${root}/models/${encodeURIComponent(options.model)}:countTokens`
      const response = await options.fetch(url, {
        method: 'POST',
        signal,
        headers: {
          'x-goog-api-key': options.apiKey,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      })
      return await readCount(response, 'totalTokens')
    },
  }
}
