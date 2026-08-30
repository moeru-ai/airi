import type { ResponsesOptions } from '@xsai-ext/responses'
import type { CommonContentPart, Message } from '@xsai/shared-chat'

import type { FetchTransportPort } from '../../contracts/fetch-transport-port'
import type { ModelRuntimeConnection, ModelRuntimeStreamInput } from '../../contracts/model-runtime-port'

import { responses } from '@xsai-ext/responses'
import { stepCountAtLeast } from '@xsai/shared-chat'

import { sanitizeMessages } from '../llm-service'
import { secretValuesFromHeaders, toModelConnectionError } from './errors'
import { createTransportFetch } from './fetch-transport'
import {
  modelRuntimeKey,
  resolveStreamTools,
  streamOptionsContentArrayOkByKey,
  streamOptionsToolsOkByKey,
} from './tools'
import { runXsAiGeneration } from './xsai-lifecycle'

/**
 * Streams OpenAI Responses through `@xsai-ext/responses`.
 *
 * AIRI maps Responses events onto the same stream contract as Chat Completions.
 */
export async function streamOpenAIResponses(
  connection: ModelRuntimeConnection,
  transport: FetchTransportPort,
  input: ModelRuntimeStreamInput,
): Promise<void> {
  const key = modelRuntimeKey(connection.connectionId, input.model)
  const supportsContentArray = streamOptionsContentArrayOkByKey(key, input.options)
  const supportedTools = streamOptionsToolsOkByKey(key, input.options)
  const tools = supportedTools ? await resolveStreamTools(input.options, input.tools) : []
  const sanitized = sanitizeMessages(input.messages as unknown[], supportsContentArray)
  const fetchImpl = createTransportFetch({
    transport,
    protocol: 'openai-responses',
    operation: 'generate',
    url: connection.generationUrl,
    headers: connection.headers,
    signal: input.options?.abortSignal,
  })

  try {
    await runXsAiGeneration((onEvent) => {
      const result = responses({
        baseURL: connection.generationUrl,
        model: input.model,
        input: toResponsesInput(sanitized),
        headers: connection.headers,
        abortSignal: input.options?.abortSignal,
        fetch: fetchImpl,
        stopWhen: stepCountAtLeast(10),
        tools: tools.length > 0 ? tools : undefined,
        ...(typeof input.options?.toolChoice === 'string'
          ? { toolChoice: input.options.toolChoice }
          : {}),
        ...(input.options?.maxOutputTokens != null
          ? { maxOutputTokens: input.options.maxOutputTokens }
          : {}),
        onEvent,
      })

      return {
        steps: result.steps,
        messages: result.input.then(responsesInputToMessages),
        usage: result.usage,
        totalUsage: result.totalUsage,
      }
    }, input.options, secretValuesFromHeaders(connection.headers))
  }
  catch (error) {
    throw toModelConnectionError(error, 'generation', secretValuesFromHeaders(connection.headers))
  }
}

type ResponsesInput = Exclude<ResponsesOptions['input'], string>

function toResponsesInput(messages: Message[]): ResponsesInput {
  const items: ResponsesInput = []

  for (const message of messages) {
    if (message.role === 'system' || message.role === 'developer') {
      items.push({
        type: 'message',
        role: message.role === 'developer' ? 'developer' : 'system',
        content: [{ type: 'input_text', text: textFromContent(message.content) }],
      })
      continue
    }

    if (message.role === 'user') {
      items.push({
        type: 'message',
        role: 'user',
        content: userContentToInput(message.content),
      })
      continue
    }

    if (message.role === 'assistant') {
      const text = textFromContent(message.content)
      if (text) {
        items.push({
          type: 'message',
          role: 'assistant',
          content: [{ type: 'output_text', text }],
        })
      }
      for (const call of message.tool_calls ?? []) {
        items.push({
          type: 'function_call',
          call_id: call.id,
          name: call.function.name ?? '',
          arguments: call.function.arguments ?? '',
        })
      }
      continue
    }

    if (message.role === 'tool') {
      items.push({
        type: 'function_call_output',
        call_id: message.tool_call_id,
        output: textFromContent(message.content),
      })
    }
  }

  return items
}

function responsesInputToMessages(items: ResponsesInput): Message[] {
  const messages: Message[] = []

  for (const item of items) {
    if (item.type === 'message' && item.role === 'system') {
      messages.push({ role: 'system', content: textFromResponsesContent(item.content) })
      continue
    }
    if (item.type === 'message' && item.role === 'developer') {
      messages.push({ role: 'developer', content: textFromResponsesContent(item.content) })
      continue
    }
    if (item.type === 'message' && item.role === 'user') {
      messages.push({ role: 'user', content: textFromResponsesContent(item.content) })
      continue
    }
    if (item.type === 'message' && item.role === 'assistant') {
      messages.push({ role: 'assistant', content: textFromResponsesContent(item.content) })
      continue
    }
    if (item.type === 'function_call') {
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [{
          id: item.call_id,
          type: 'function',
          function: {
            name: item.name,
            arguments: item.arguments,
          },
        }],
      })
      continue
    }
    if (item.type === 'function_call_output') {
      messages.push({
        role: 'tool',
        tool_call_id: item.call_id,
        content: typeof item.output === 'string' ? item.output : JSON.stringify(item.output),
      })
    }
  }

  return messages
}

function userContentToInput(content: Message['content']): Extract<ResponsesInput[number], { type: 'message', role: 'user' }>['content'] {
  if (typeof content === 'string')
    return [{ type: 'input_text', text: content }]
  if (content == null)
    return [{ type: 'input_text', text: '' }]

  const parts: Array<{ type: 'input_text', text: string } | { type: 'input_image', image_url?: string, detail?: 'auto' }> = []
  for (const part of content as CommonContentPart[]) {
    if (part.type === 'text') {
      parts.push({ type: 'input_text', text: part.text })
      continue
    }
    if (part.type === 'image_url') {
      parts.push({ type: 'input_image', image_url: part.image_url.url, detail: 'auto' })
      continue
    }
    throw toModelConnectionError(
      new Error(`OpenAI Responses does not support ${part.type} content parts.`),
      'generation',
    )
  }

  return parts.length > 0 ? parts : [{ type: 'input_text', text: '' }]
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (!Array.isArray(content))
    return content == null ? '' : JSON.stringify(content)

  return content
    .map((part) => {
      if (typeof part === 'string')
        return part
      if (typeof part === 'object' && part != null && 'text' in part)
        return String((part as { text?: string }).text ?? '')
      return ''
    })
    .join('')
}

function textFromResponsesContent(content: unknown): string {
  if (typeof content === 'string')
    return content
  if (!Array.isArray(content))
    return ''

  return content
    .map((part) => {
      if (typeof part !== 'object' || part == null)
        return ''
      if ('text' in part)
        return String((part as { text?: string }).text ?? '')
      return ''
    })
    .join('')
}
