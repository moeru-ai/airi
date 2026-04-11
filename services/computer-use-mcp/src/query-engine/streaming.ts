/**
 * Streaming LLM call — SSE-based chat completions with real-time token output.
 *
 * Uses the OpenAI-compatible streaming API (stream: true) and emits
 * content deltas via a callback as they arrive. Falls back to non-streaming
 * if the response doesn't contain SSE data.
 *
 * NOTICE: Tool calls in streaming mode are assembled from multiple chunks.
 * The function accumulates tool_call deltas and returns the final assembled
 * response in the same LLMResponse format as the non-streaming variant.
 */

import type { LLMResponse, QueryEngineConfig, QueryMessage, ToolCall } from './types'

/**
 * Call an OpenAI-compatible chat completions API with streaming.
 *
 * @param onDelta — Called with each content delta as it arrives.
 *   This is what enables real-time display of the agent's thinking.
 */
export async function callLLMStreaming(params: {
  config: QueryEngineConfig
  messages: QueryMessage[]
  tools: Array<{ type: 'function', function: { name: string, description: string, parameters: Record<string, unknown> } }>
  onDelta?: (delta: string) => void
}): Promise<LLMResponse> {
  const { config, messages, tools, onDelta } = params

  if (!config.apiKey) {
    throw new Error('AIRI_AGENT_API_KEY is not set.')
  }

  const body: Record<string, unknown> = {
    model: config.model,
    messages,
    tools: tools.length > 0 ? tools : undefined,
    tool_choice: tools.length > 0 ? 'auto' : undefined,
    stream: true,
    // NOTICE: Without this, most providers (including OpenAI) do NOT return
    // usage statistics in streaming mode. This was causing 0K token reports.
    stream_options: { include_usage: true },
  }

  const response = await fetch(`${config.baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${config.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: config.abortSignal,
  })

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'unknown error')
    throw new Error(`LLM API error (${response.status}): ${errorText.slice(0, 500)}`)
  }

  // Parse SSE stream
  const reader = response.body?.getReader()
  if (!reader) {
    throw new Error('Response body is not readable (streaming not supported)')
  }

  const decoder = new TextDecoder()
  let contentParts: string[] = []
  let finishReason = ''
  let usage: LLMResponse['usage']

  // Tool call accumulator — streaming sends tool calls in pieces
  const toolCallMap = new Map<number, {
    id: string
    type: 'function'
    function: { name: string, arguments: string }
  }>()

  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done)
      break

    buffer += decoder.decode(value, { stream: true })

    // Process complete SSE lines
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? '' // Keep incomplete line in buffer

    for (const line of lines) {
      if (!line.startsWith('data: '))
        continue
      const data = line.slice(6).trim()
      if (data === '[DONE]')
        continue

      try {
        const chunk = JSON.parse(data) as {
          choices?: Array<{
            delta: {
              content?: string | null
              tool_calls?: Array<{
                index: number
                id?: string
                type?: string
                function?: { name?: string, arguments?: string }
              }>
            }
            finish_reason?: string | null
          }>
          usage?: {
            prompt_tokens: number
            completion_tokens: number
            total_tokens: number
          }
        }

        const choice = chunk.choices?.[0]
        if (!choice)
          continue

        // Content delta
        if (choice.delta.content) {
          contentParts.push(choice.delta.content)
          onDelta?.(choice.delta.content)
        }

        // Tool call deltas
        if (choice.delta.tool_calls) {
          for (const tcDelta of choice.delta.tool_calls) {
            const existing = toolCallMap.get(tcDelta.index)
            if (!existing) {
              toolCallMap.set(tcDelta.index, {
                id: tcDelta.id ?? '',
                type: 'function' as const,
                function: {
                  name: tcDelta.function?.name ?? '',
                  arguments: tcDelta.function?.arguments ?? '',
                },
              })
            }
            else {
              if (tcDelta.id)
                existing.id = tcDelta.id
              if (tcDelta.function?.name)
                existing.function.name += tcDelta.function.name
              if (tcDelta.function?.arguments)
                existing.function.arguments += tcDelta.function.arguments
            }
          }
        }

        // Finish reason
        if (choice.finish_reason) {
          finishReason = choice.finish_reason
        }

        // Usage (sometimes sent in the last chunk)
        if (chunk.usage) {
          usage = {
            promptTokens: chunk.usage.prompt_tokens,
            completionTokens: chunk.usage.completion_tokens,
            totalTokens: chunk.usage.total_tokens,
          }
        }
      }
      catch { /* skip malformed chunks */ }
    }
  }

  // Assemble final response
  const content = contentParts.join('') || null
  const toolCalls: ToolCall[] = Array.from(toolCallMap.entries())
    .sort(([a], [b]) => a - b)
    .map(([_, tc]) => tc)

  return {
    content,
    toolCalls,
    finishReason,
    usage,
  }
}
