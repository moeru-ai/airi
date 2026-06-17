/**
 * Minimal standalone task runner.
 *
 * In VSCode mode the extension host runs the full Task loop (tool use,
 * checkpoints, diff-view, etc.). In standalone mode we don't have any of
 * that — so we do the simplest possible thing: call the LLM once with the
 * user's message, collect the streamed text, and push both into
 * state.clineMessages so the chat UI renders them.
 *
 * This is intentionally KISS. Phase 2 can add tool use / filesystem /
 * terminal. For now: single-turn Q&A over the configured provider.
 *
 * We call LLM providers via raw HTTP (fetch) to avoid pulling in the
 * heavy SDK dependencies that the shared api/ module requires. The
 * standalone backend only needs to support the four most common
 * providers — anything else can route through OpenRouter.
 */

import { getState, patchState } from './state.js'
import type { ExtensionState } from '@roo-code/types'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LLMMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

interface StreamChunk {
  type: 'text' | 'usage'
  text?: string
  inputTokens?: number
  outputTokens?: number
  totalCost?: number
}

interface ClineMessage {
  ts: number
  type: 'ask' | 'say'
  ask?: string
  say?: 'assistant' | 'user' | 'error' | string
  text?: string
  partial?: boolean
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Run a single-turn LLM call for a newly created task.
 *
 * Mutates state.clineMessages in place (via patchState) and calls the
 * provided `onUpdate` callback so the caller can broadcast state updates.
 * Keeping the broadcast hook as a parameter avoids a circular import
 * between task-runner <-> websocket.
 */
export async function runTask(taskId: string, text: string, onUpdate?: () => void): Promise<void> {
  const state = getState()
  const apiConfig = state.apiConfiguration

  if (!apiConfig?.apiProvider) {
    appendMessage(
      {
        ts: Date.now(),
        type: 'say',
        say: 'error',
        text: 'No API provider configured. Open Settings -> Providers to set one up.',
      },
      onUpdate,
    )
    return
  }

  // 1. Append the user message.
  appendMessage(
    {
      ts: Date.now(),
      type: 'say',
      say: 'user',
      text,
    },
    onUpdate,
  )

  // 2. Call the LLM.
  let assistantText = ''
  let assistantMessageTs: number | null = null
  try {
    const systemPrompt = 'You are Roo, a helpful AI coding assistant. Be concise and direct.'
    const messages: LLMMessage[] = [{ role: 'user', content: text }]

    const stream = streamLLM(apiConfig, systemPrompt, messages)

    for await (const chunk of stream) {
      if (chunk.type === 'text' && chunk.text) {
        assistantText += chunk.text

        if (assistantMessageTs === null) {
          assistantMessageTs = Date.now()
          appendMessage(
            {
              ts: assistantMessageTs,
              type: 'say',
              say: 'assistant',
              text: assistantText,
              partial: true,
            },
            onUpdate,
          )
        } else {
          // Update the existing assistant message in place.
          const s = getState()
          const msgs = s.clineMessages || []
          const idx = msgs.findIndex(
            (m) => m.type === 'say' && (m.say as string) === 'assistant' && m.ts === assistantMessageTs,
          )
          if (idx !== -1) {
            const updated = [...msgs]
            updated[idx] = { ...updated[idx], text: assistantText, partial: true }
            patchState({ clineMessages: updated } as Partial<ExtensionState>)
            onUpdate?.()
          }
        }
      } else if (chunk.type === 'usage') {
        // Store cost info on the task record via patchState (immutable).
        const s = getState()
        const tasks = s.taskHistory || []
        const idx = tasks.findIndex((t) => t.id === taskId)
        if (idx !== -1) {
          const updated = [...tasks]
          updated[idx] = {
            ...updated[idx],
            tokensIn: chunk.inputTokens ?? updated[idx].tokensIn ?? 0,
            tokensOut: chunk.outputTokens ?? updated[idx].tokensOut ?? 0,
            totalCost: chunk.totalCost ?? updated[idx].totalCost ?? 0,
          }
          patchState({ taskHistory: updated } as Partial<ExtensionState>)
          onUpdate?.()
        }
      }
    }
  } catch (err: unknown) {
    assistantText = `Error calling ${apiConfig.apiProvider}: ${err instanceof Error ? err.message : String(err)}`
    appendMessage(
      {
        ts: Date.now(),
        type: 'say',
        say: 'error',
        text: assistantText,
      },
      onUpdate,
    )
  }

  // 3. Mark the streaming assistant message as complete (non-partial).
  if (assistantMessageTs !== null && assistantText && !assistantText.startsWith('Error')) {
    const s = getState()
    const msgs = s.clineMessages || []
    const idx = msgs.findIndex(
      (m) => m.type === 'say' && (m.say as string) === 'assistant' && m.ts === assistantMessageTs,
    )
    if (idx !== -1) {
      const updated = [...msgs]
      updated[idx] = { ...updated[idx], partial: false }
      patchState({ clineMessages: updated } as Partial<ExtensionState>)
      onUpdate?.()
    }
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Append a ClineMessage to state.clineMessages and push a state update.
 */
function appendMessage(message: ClineMessage, onUpdate?: () => void): void {
  const state = getState()
  const clineMessages = [...(state.clineMessages || []), message]
  patchState({ clineMessages } as Partial<ExtensionState>)
  onUpdate?.()
}

/**
 * Pick the right streaming function for the configured provider.
 */
function streamLLM(
  apiConfig: Record<string, unknown>,
  systemPrompt: string,
  messages: LLMMessage[],
): AsyncGenerator<StreamChunk> {
  const provider = String(apiConfig.apiProvider ?? 'openrouter').toLowerCase()

  switch (provider) {
    case 'anthropic':
      return streamAnthropic(apiConfig, systemPrompt, messages)
    case 'openai':
    case 'openai-native':
      return streamOpenAI(apiConfig, systemPrompt, messages)
    case 'gemini':
      return streamGemini(apiConfig, systemPrompt, messages)
    case 'openrouter':
    default:
      return streamOpenRouter(apiConfig, systemPrompt, messages)
  }
}

// ---------------------------------------------------------------------------
// Provider implementations (raw HTTP using fetch + SSE)
// ---------------------------------------------------------------------------

async function* streamAnthropic(
  apiConfig: Record<string, unknown>,
  systemPrompt: string,
  messages: LLMMessage[],
): AsyncGenerator<StreamChunk> {
  const apiKey = String(apiConfig.apiKey ?? '')
  const model = String(apiConfig.apiModelId ?? apiConfig.modelId ?? 'claude-sonnet-4-5')

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages,
      stream: true,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Anthropic ${res.status}: ${body}`)
  }

  yield* parseSSE(res, (data) => {
    if (data.type === 'content_block_delta' && data.delta?.type === 'text_delta') {
      return { type: 'text' as const, text: data.delta.text }
    }
    if (data.type === 'message_delta' && data.usage) {
      return {
        type: 'usage' as const,
        inputTokens: data.usage.input_tokens ?? 0,
        outputTokens: data.usage.output_tokens ?? 0,
        totalCost: 0,
      }
    }
    return null
  })
}

async function* streamOpenAI(
  apiConfig: Record<string, unknown>,
  systemPrompt: string,
  messages: LLMMessage[],
): AsyncGenerator<StreamChunk> {
  const apiKey = String(apiConfig.apiKey ?? '')
  const model = String(apiConfig.apiModelId ?? apiConfig.modelId ?? 'gpt-4o')
  const baseURL = String(apiConfig.baseURL || 'https://api.openai.com/v1')

  const res = await fetch(`${baseURL}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenAI ${res.status}: ${body}`)
  }

  yield* parseSSE(res, (data) => {
    const choice = data.choices?.[0]
    if (choice?.delta?.content) {
      return { type: 'text' as const, text: choice.delta.content }
    }
    if (data.usage) {
      return {
        type: 'usage' as const,
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
        totalCost: 0,
      }
    }
    return null
  })
}

async function* streamGemini(
  apiConfig: Record<string, unknown>,
  systemPrompt: string,
  messages: LLMMessage[],
): AsyncGenerator<StreamChunk> {
  const apiKey = String(apiConfig.apiKey ?? '')
  const model = String(apiConfig.apiModelId ?? apiConfig.modelId ?? 'gemini-2.5-flash')
  const baseURL = String(apiConfig.baseURL || 'https://generativelanguage.googleapis.com/v1beta')

  // Gemini uses a different message format — convert to contents array.
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))

  const res = await fetch(`${baseURL}/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: systemPrompt }] },
      contents,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Gemini ${res.status}: ${body}`)
  }

  yield* parseSSE(res, (data) => {
    const candidate = data.candidates?.[0]
    const part = candidate?.content?.parts?.[0]
    if (part?.text) {
      return { type: 'text' as const, text: part.text }
    }
    if (data.usageMetadata) {
      return {
        type: 'usage' as const,
        inputTokens: Number(data.usageMetadata.promptTokenCount ?? 0),
        outputTokens: Number(data.usageMetadata.candidatesTokenCount ?? 0),
        totalCost: 0,
      }
    }
    return null
  })
}

async function* streamOpenRouter(
  apiConfig: Record<string, unknown>,
  systemPrompt: string,
  messages: LLMMessage[],
): AsyncGenerator<StreamChunk> {
  const apiKey = String(apiConfig.apiKey ?? '')
  const model = String(apiConfig.apiModelId ?? apiConfig.modelId ?? 'openai/gpt-4o')

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
      stream: true,
      stream_options: { include_usage: true },
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`OpenRouter ${res.status}: ${body}`)
  }

  yield* parseSSE(res, (data) => {
    const choice = data.choices?.[0]
    if (choice?.delta?.content) {
      return { type: 'text' as const, text: choice.delta.content }
    }
    if (data.usage) {
      return {
        type: 'usage' as const,
        inputTokens: data.usage.prompt_tokens ?? 0,
        outputTokens: data.usage.completion_tokens ?? 0,
        totalCost: Number(data.usage.total_cost ?? 0),
      }
    }
    return null
  })
}

// ---------------------------------------------------------------------------
// SSE parser
// ---------------------------------------------------------------------------

/**
 * Read a streaming response body line-by-line (SSE format) and yield
 * parsed chunks that the `extract` callback returns.
 */
async function* parseSSE(res: Response, extract: (data: any) => StreamChunk | null): AsyncGenerator<StreamChunk> {
  const reader = res.body?.getReader()
  if (!reader) throw new Error('No response body')

  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed || !trimmed.startsWith('data:')) continue
      const json = trimmed.slice(5).trim()
      if (json === '[DONE]') continue

      let data: any
      try {
        data = JSON.parse(json)
      } catch {
        continue
      }

      const chunk = extract(data)
      if (chunk) yield chunk
    }
  }

  // Flush any remaining buffered text (handles responses that don't end with a newline)
  if (buffer.trim()) {
    const trimmed = buffer.trim()
    if (trimmed.startsWith('data:')) {
      const json = trimmed.slice(5).trim()
      if (json && json !== '[DONE]') {
        let data: any
        try {
          data = JSON.parse(json)
        } catch {
          return
        }
        const chunk = extract(data)
        if (chunk) yield chunk
      }
    }
  }
}
