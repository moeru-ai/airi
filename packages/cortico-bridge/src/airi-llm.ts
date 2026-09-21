import type { GenerateOptions, Generation, ResponseClient } from 'cortico/core/generation.ts'
import type { GenerationError as GenerationErrorType } from 'cortico/core/generation.ts'
import type { ItemOrigin } from 'cortico/protocol/open-responses/context.ts'
import type { InputItem, OutputItem, Request, Response } from 'cortico/protocol/open-responses/index.ts'
import type { Message, Tool } from '@xsai/shared-chat'

import { GenerationError, unknownMeters } from 'cortico/core/generation.ts'
import { stepCountAtLeast } from '@xsai/shared-chat'
import { streamText } from '@xsai/stream-text'

/** Provider configuration pushed from the AIRI stage over the bridge socket. */
export interface AiriProviderConfig {
  /** OpenAI-compatible chat-completions base URL, e.g. `https://api.openai.com/v1`. */
  baseUrl: string
  apiKey?: string
  model: string
}

function contentPartsToText(parts: unknown): string {
  if (typeof parts === 'string')
    return parts
  if (!Array.isArray(parts))
    return ''
  return parts
    .map((part) => {
      if (part && typeof part === 'object') {
        const p = part as Record<string, unknown>
        if (p.type === 'input_text' || p.type === 'output_text' || p.type === 'text')
          return typeof p.text === 'string' ? p.text : ''
      }
      return ''
    })
    .join('')
}

function contentPartsToXsai(parts: unknown): { type: string, [k: string]: unknown }[] | string {
  if (typeof parts === 'string')
    return parts
  if (!Array.isArray(parts))
    return ''
  const mapped: { type: string, [k: string]: unknown }[] = parts.flatMap((part): { type: string, [k: string]: unknown }[] => {
    if (!part || typeof part !== 'object')
      return []
    const p = part as Record<string, unknown>
    if (p.type === 'input_text' || p.type === 'text')
      return [{ type: 'text', text: String(p.text ?? '') }]
    if (p.type === 'input_image' && typeof p.image_url === 'string')
      return [{ type: 'image_url', image_url: { url: p.image_url } }]
    return []
  })
  return mapped.length ? mapped : ''
}

/** Maps one Cortico input item onto zero-or-more chat-completions messages. */
function inputItemToMessages(item: InputItem | string): Message[] {
  if (typeof item === 'string')
    return item ? [{ role: 'user', content: item }] : []
  const record = item as Record<string, unknown>
  switch (record.type) {
    case 'message': {
      const role = record.role as string
      if (role === 'assistant')
        return [{ role: 'assistant', content: contentPartsToText(record.content) }]
      if (role === 'system' || role === 'developer')
        return [{ role: 'system', content: contentPartsToXsai(record.content) } as Message]
      return [{ role: 'user', content: contentPartsToXsai(record.content) } as Message]
    }
    case 'function_call':
      return [{
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: String(record.call_id ?? record.id ?? ''),
          type: 'function',
          function: { name: String(record.name ?? ''), arguments: String(record.arguments ?? '') },
        }],
      }]
    case 'function_call_output':
      return [{
        role: 'tool',
        tool_call_id: String(record.call_id ?? ''),
        content: typeof record.output === 'string' ? record.output : JSON.stringify(record.output ?? ''),
      }]
    default:
      // reasoning / item_reference / host-specific items have no chat-completions form.
      return []
  }
}

function requestToMessages(request: Request): Message[] {
  const messages: Message[] = []
  if (request.instructions)
    messages.push({ role: 'system', content: request.instructions })
  for (const item of request.input ?? [])
    messages.push(...inputItemToMessages(item))
  return messages
}

function requestToTools(request: Request): Tool[] | undefined {
  const tools = (request.tools ?? []).flatMap((tool) => {
    const t = tool as Record<string, unknown>
    if (t.type !== 'function')
      return []
    return [{
      type: 'function' as const,
      function: {
        name: String(t.name ?? ''),
        description: typeof t.description === 'string' ? t.description : undefined,
        parameters: (t.parameters ?? { type: 'object', properties: {} }) as Record<string, unknown>,
        strict: typeof t.strict === 'boolean' ? t.strict : undefined,
      },
      // Cortico executes tools itself; stopWhen ends the step before xsai would run this.
      execute: () => 'unhandled',
    }]
  })
  return tools.length ? tools : undefined
}

function outputFromMessages(messages: Message[]): OutputItem[] {
  const output: OutputItem[] = []
  for (const message of messages) {
    if (message.role !== 'assistant')
      continue
    const text = contentPartsToText(message.content)
    if (text) {
      output.push({
        type: 'message',
        id: `msg_${Math.random().toString(36).slice(2, 10)}`,
        role: 'assistant',
        status: 'completed',
        content: [{ type: 'output_text', text, annotations: [] }],
      } as unknown as OutputItem)
    }
    for (const call of message.tool_calls ?? []) {
      output.push({
        type: 'function_call',
        call_id: call.id,
        name: call.function.name ?? '',
        arguments: call.function.arguments ?? '',
        status: 'completed',
      } as OutputItem)
    }
  }
  return output
}

/**
 * ResponseClient backed by an OpenAI-compatible chat-completions endpoint whose
 * configuration the AIRI stage pushes over the bridge socket. Until a config
 * arrives, requests fail with a descriptive error.
 */
export class AiriChatCompletionsClient implements ResponseClient {
  private config: AiriProviderConfig | null = null

  configure(config: AiriProviderConfig | null) {
    this.config = config
  }

  configured() {
    return this.config !== null
  }

  bind(): ResponseClient {
    return this
  }

  async respond(request: Request, options?: GenerateOptions): Promise<Generation> {
    const config = this.config
    if (!config)
      throw new Error('AIRI provider not configured — select a chat provider and model in AIRI settings')

    const origin: ItemOrigin = options?.origin ?? {
      instance: 'airi',
      module: 'airi-chat-completions',
      model: request.model ?? config.model,
      compatibilityDomain: 'airi',
    }
    const startedAt = new Date().toISOString()
    const started = Date.now()
    let responseId: string | null = null
    let sawDelta = false

    const response = {
      id: `resp_airi_${started.toString(36)}`,
      object: 'response',
      created_at: Math.floor(started / 1000),
      completed_at: null,
      status: 'completed',
      incomplete_details: null,
      model: request.model ?? config.model,
      previous_response_id: null,
      instructions: null,
      output: [] as OutputItem[],
      parallel_tool_calls: request.parallel_tool_calls ?? true,
      tool_choice: 'auto',
      tools: [],
    } as unknown as Response

    try {
      const inputMessages = requestToMessages(request)
      const result = streamText({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
        model: request.model ?? config.model,
        messages: inputMessages,
        tools: requestToTools(request),
        temperature: request.temperature ?? undefined,
        topP: request.top_p ?? undefined,
        maxTokens: request.max_output_tokens ?? undefined,
        abortSignal: options?.signal,
        stopWhen: stepCountAtLeast(1),
        streamOptions: { includeUsage: true },
        onEvent: (event: { type: string, delta?: string }) => {
          const emit = options?.onEvent
          if (!emit)
            return
          if (event.type === 'text.delta') {
            if (!sawDelta) {
              sawDelta = true
              emit({ type: 'response.created', response } as never)
            }
            emit({ type: 'response.output_text.delta', delta: event.delta, item_id: '', output_index: 0, content_index: 0 } as never)
          }
        },
      })

      // xsai mutates the input array in place; only the tail past the input
      // prefix is this generation's output. Attach handlers to every result
      // promise and cancel unused streams BEFORE awaiting — an early rejection
      // (e.g. upstream unreachable) must not leave later promises unhandled.
      void result.steps.catch(() => {})
      void result.usage.catch(() => {})
      const totalUsage = result.totalUsage.catch(() => undefined)
      void result.eventStream.cancel().catch(() => {})
      void result.fullStream.cancel().catch(() => {})
      void result.textStream.cancel().catch(() => {})
      void result.reasoningTextStream.cancel().catch(() => {})
      const messages = (await result.messages).slice(inputMessages.length)
      const usage = await totalUsage
      response.output = outputFromMessages(messages)
      responseId = response.id
      if (usage) {
        response.usage = {
          input_tokens: usage.inputTokens ?? 0,
          output_tokens: usage.outputTokens ?? 0,
          total_tokens: usage.totalTokens ?? 0,
        } as never
      }

      const emit = options?.onEvent
      if (emit) {
        if (!sawDelta)
          emit({ type: 'response.created', response } as never)
        for (const item of response.output)
          emit({ type: 'response.output_item.done', item, output_index: 0 } as never)
        emit({ type: 'response.completed', response } as never)
      }

      const meters = unknownMeters()
      if (usage) {
        meters.input = usage.inputTokens ?? null
        meters.output = usage.outputTokens ?? null
        meters.total = usage.totalTokens ?? null
      }
      return {
        response,
        origin,
        attempts: [{
          id: `attempt_${started.toString(36)}`,
          generationId: response.id,
          ordinal: 0,
          origin,
          startedAt,
          elapsedMs: Date.now() - started,
          requestId: null,
          responseId,
          outcome: 'completed',
          status: 200,
          serviceTier: null,
          meters,
          charges: [],
        }],
      }
    }
    catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      const attempt = {
        id: `attempt_${started.toString(36)}`,
        generationId: response.id,
        ordinal: 0,
        origin,
        startedAt,
        elapsedMs: Date.now() - started,
        requestId: null,
        responseId,
        outcome: 'failed' as const,
        status: 0,
        serviceTier: null,
        meters: unknownMeters(),
        charges: [],
      }
      throw new GenerationError(
        `AIRI provider request failed: ${err.message}`,
        [attempt],
        null,
        origin,
        0,
        '',
        { cause: error },
      ) as GenerationErrorType
    }
  }
}
