import type { Tool as AnthropicTool, MessageParam, RawMessageStreamEvent } from '@anthropic-ai/sdk/resources/messages/messages'
import type { CommonContentPart, Message, Tool, ToolMessage } from '@xsai/shared-chat'

import type { FetchTransportPort } from '../../contracts/fetch-transport-port'
import type { ModelRuntimeConnection, ModelRuntimeStreamInput } from '../../contracts/model-runtime-port'
import type { LlmUsage, StreamEvent } from '../../types/llm'

import { Anthropic } from '@anthropic-ai/sdk'
import { executeTool } from '@xsai/shared-chat'

import { sanitizeMessages } from '../llm-service'
import { ModelConnectionError, secretValuesFromHeaders, toModelConnectionError } from './errors'
import { createTransportFetch } from './fetch-transport'
import {
  modelRuntimeKey,
  resolveStreamTools,
  streamOptionsContentArrayOkByKey,
  streamOptionsToolsOkByKey,
} from './tools'

const DEFAULT_ANTHROPIC_MAX_TOKENS = 4096
const MAX_TOOL_STEPS = 10

/**
 * Streams Anthropic Messages through the official `@anthropic-ai/sdk`.
 *
 * AIRI maps text, thinking, tool, usage, and error events onto the same
 * contract as the xsAI adapters.
 */
export async function streamAnthropicMessages(
  connection: ModelRuntimeConnection,
  transport: FetchTransportPort,
  input: ModelRuntimeStreamInput,
): Promise<void> {
  const key = modelRuntimeKey(connection.connectionId, input.model)
  const supportsContentArray = streamOptionsContentArrayOkByKey(key, input.options)
  const supportedTools = streamOptionsToolsOkByKey(key, input.options)
  const tools = supportedTools ? await resolveStreamTools(input.options, input.tools) : []
  const sanitized = sanitizeMessages(input.messages as unknown[], supportsContentArray)
  const { system, messages } = toAnthropicMessages(sanitized)
  const transcript: Message[] = [...sanitized]
  const fetchImpl = createTransportFetch({
    transport,
    protocol: 'anthropic-messages',
    operation: 'generate',
    url: connection.generationUrl,
    headers: connection.headers,
    signal: input.options?.abortSignal,
  })
  const client = new Anthropic({
    ...anthropicClientAuth(connection.headers),
    baseURL: new URL(connection.generationUrl).origin,
    fetch: fetchImpl,
    maxRetries: 0,
    dangerouslyAllowBrowser: true,
  })

  let usage: LlmUsage = { source: 'unavailable' }

  try {
    for (let step = 0; step < MAX_TOOL_STEPS; step += 1) {
      const pendingAssistant: AnthropicAssistantState = {
        content: [],
        text: '',
        reasoning: '',
        stopReason: null,
        inputTokens: 0,
        outputTokens: 0,
      }

      const stream = await client.messages.create({
        model: input.model,
        max_tokens: input.options?.maxOutputTokens ?? DEFAULT_ANTHROPIC_MAX_TOKENS,
        messages,
        ...(system ? { system } : {}),
        ...(tools.length > 0 ? { tools: toAnthropicTools(tools) } : {}),
        stream: true,
      }, {
        signal: input.options?.abortSignal,
      })

      for await (const event of stream) {
        await handleAnthropicEvent(event, pendingAssistant, input.options?.onStreamEvent)
      }

      usage = toUsage(pendingAssistant)
      const assistantMessage = toAssistantMessage(pendingAssistant)
      transcript.push(assistantMessage)
      messages.push(assistantMessageToParam(pendingAssistant))

      const toolCalls = pendingAssistant.content.filter(block => block.type === 'tool_use')
      if (pendingAssistant.stopReason !== 'tool_use' || toolCalls.length === 0)
        break

      const toolResults: Array<{ message: ToolMessage, isError: boolean }> = []
      for (const call of toolCalls) {
        await input.options?.onStreamEvent?.({
          type: 'tool-call',
          args: JSON.stringify(call.input ?? {}),
          toolCallId: call.id,
          toolCallType: 'function',
          toolName: call.name,
        })

        const executed = await executeTool({
          abortSignal: input.options?.abortSignal,
          messages: transcript,
          toolCall: {
            id: call.id,
            type: 'function',
            function: {
              name: call.name,
              arguments: JSON.stringify(call.input ?? {}),
            },
          },
          tools,
        })

        const resultText = typeof executed.result === 'string'
          ? executed.result
          : JSON.stringify(executed.result)
        const streamEvent: StreamEvent = executed.completionToolResult.isError === true
          ? { ...executed.completionToolResult, type: 'tool-error', isError: true }
          : {
              type: 'tool-result',
              toolCallId: executed.completionToolCall.toolCallId,
              result: resultText,
            }
        await input.options?.onStreamEvent?.(streamEvent)

        const isError = executed.completionToolResult.isError === true
        const toolMessage: ToolMessage = {
          role: 'tool',
          tool_call_id: call.id,
          content: resultText,
        }
        toolResults.push({ message: toolMessage, isError })
        transcript.push(toolMessage)
      }

      messages.push({
        role: 'user',
        content: toolResults.map(result => ({
          type: 'tool_result' as const,
          tool_use_id: result.message.tool_call_id,
          content: typeof result.message.content === 'string'
            ? result.message.content
            : JSON.stringify(result.message.content),
          is_error: result.isError,
        })),
      })
    }

    await input.options?.onMessages?.(transcript)
    await input.options?.onStreamEvent?.({ type: 'finish' } as const)
    await input.options?.onUsage?.(usage)
  }
  catch (error) {
    if (error instanceof ModelConnectionError)
      throw error
    throw toModelConnectionError(error, 'generation', secretValuesFromHeaders(connection.headers))
  }
}

interface AnthropicToolUseBlock {
  type: 'tool_use'
  id: string
  name: string
  input: Record<string, unknown>
  partialJson: string
}

interface AnthropicTextBlock {
  type: 'text'
  text: string
}

interface AnthropicThinkingBlock {
  type: 'thinking'
  thinking: string
}

type AnthropicContentBlock = AnthropicToolUseBlock | AnthropicTextBlock | AnthropicThinkingBlock

interface AnthropicAssistantState {
  content: AnthropicContentBlock[]
  text: string
  reasoning: string
  stopReason: string | null
  inputTokens: number
  outputTokens: number
}

async function handleAnthropicEvent(
  event: RawMessageStreamEvent,
  state: AnthropicAssistantState,
  onStreamEvent?: (event: StreamEvent) => void | Promise<void>,
): Promise<void> {
  switch (event.type) {
    case 'message_start': {
      state.inputTokens = event.message.usage.input_tokens
      return
    }
    case 'content_block_start': {
      if (event.content_block.type === 'text') {
        state.content[event.index] = { type: 'text', text: event.content_block.text ?? '' }
        return
      }
      if (event.content_block.type === 'thinking') {
        state.content[event.index] = { type: 'thinking', thinking: event.content_block.thinking ?? '' }
        return
      }
      if (event.content_block.type === 'tool_use') {
        state.content[event.index] = {
          type: 'tool_use',
          id: event.content_block.id,
          name: event.content_block.name,
          input: {},
          partialJson: '',
        }
      }
      return
    }
    case 'content_block_delta': {
      const block = state.content[event.index]
      if (event.delta.type === 'text_delta') {
        if (block?.type === 'text')
          block.text += event.delta.text
        state.text += event.delta.text
        await onStreamEvent?.({ type: 'text-delta', text: event.delta.text })
        return
      }
      if (event.delta.type === 'thinking_delta') {
        if (block?.type === 'thinking')
          block.thinking += event.delta.thinking
        state.reasoning += event.delta.thinking
        await onStreamEvent?.({ type: 'reasoning-delta', text: event.delta.thinking })
        return
      }
      if (event.delta.type === 'input_json_delta' && block?.type === 'tool_use')
        block.partialJson += event.delta.partial_json
      return
    }
    case 'content_block_stop': {
      const block = state.content[event.index]
      if (block?.type === 'tool_use')
        block.input = parseToolInput(block.partialJson)
      return
    }
    case 'message_delta': {
      state.stopReason = event.delta.stop_reason ?? state.stopReason
      state.outputTokens = event.usage.output_tokens
    }
  }
}

function toAnthropicMessages(messages: Message[]): { system?: string, messages: MessageParam[] } {
  const systemParts: string[] = []
  const converted: MessageParam[] = []

  for (const message of messages) {
    if (message.role === 'system' || message.role === 'developer') {
      systemParts.push(textFromContent(message.content))
      continue
    }
    if (message.role === 'user') {
      converted.push({ role: 'user', content: toUserContent(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      converted.push(assistantMessageToParamFromXsAi(message))
      continue
    }
    if (message.role === 'tool') {
      const last = converted.at(-1)
      const toolResult = {
        type: 'tool_result' as const,
        tool_use_id: message.tool_call_id,
        content: textFromContent(message.content),
      }
      if (last?.role === 'user' && Array.isArray(last.content)) {
        last.content.push(toolResult)
        continue
      }
      converted.push({ role: 'user', content: [toolResult] })
    }
  }

  return {
    ...(systemParts.length > 0 ? { system: systemParts.join('\n') } : {}),
    messages: mergeAdjacentMessages(converted),
  }
}

function mergeAdjacentMessages(messages: MessageParam[]): MessageParam[] {
  const merged: MessageParam[] = []
  for (const message of messages) {
    const last = merged.at(-1)
    if (last && last.role === message.role) {
      last.content = [...asContentBlocks(last.content), ...asContentBlocks(message.content)]
      continue
    }
    merged.push({
      role: message.role,
      content: asContentBlocks(message.content),
    })
  }
  return merged
}

function asContentBlocks(content: MessageParam['content']): Exclude<MessageParam['content'], string> {
  if (typeof content === 'string')
    return [{ type: 'text', text: content }]
  return content
}

function toUserContent(content: Message['content']): MessageParam['content'] {
  if (typeof content === 'string')
    return content
  if (content == null)
    return ''

  const blocks: Exclude<MessageParam['content'], string> = []
  for (const part of content as CommonContentPart[]) {
    if (part.type === 'text') {
      blocks.push({ type: 'text', text: part.text })
      continue
    }
    if (part.type === 'image_url') {
      blocks.push(toImageBlock(part.image_url.url))
      continue
    }
    throw new ModelConnectionError({
      stage: 'generation',
      code: 'unsupported-response',
      message: `Anthropic Messages does not support ${part.type} content parts.`,
      retryable: false,
    })
  }
  return blocks.length > 0 ? blocks : ''
}

function toImageBlock(url: string): Extract<Exclude<MessageParam['content'], string>[number], { type: 'image' }> {
  const dataUrl = /^data:(image\/(?:jpeg|png|gif|webp));base64,(.+)$/i.exec(url)
  if (dataUrl) {
    return {
      type: 'image',
      source: {
        type: 'base64',
        media_type: dataUrl[1] as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
        data: dataUrl[2],
      },
    }
  }

  return {
    type: 'image',
    source: {
      type: 'url',
      url,
    },
  }
}

function assistantMessageToParamFromXsAi(message: Extract<Message, { role: 'assistant' }>): MessageParam {
  const blocks: Exclude<MessageParam['content'], string> = []
  const text = textFromContent(message.content)
  if (text)
    blocks.push({ type: 'text', text })
  for (const call of message.tool_calls ?? []) {
    blocks.push({
      type: 'tool_use',
      id: call.id,
      name: call.function.name ?? '',
      input: parseToolInput(call.function.arguments ?? '{}'),
    })
  }
  return { role: 'assistant', content: blocks.length > 0 ? blocks : '' }
}

function assistantMessageToParam(state: AnthropicAssistantState): MessageParam {
  const blocks: Exclude<MessageParam['content'], string> = []
  for (const block of state.content) {
    if (!block)
      continue
    if (block.type === 'text' && block.text)
      blocks.push({ type: 'text', text: block.text })
    if (block.type === 'tool_use') {
      blocks.push({
        type: 'tool_use',
        id: block.id,
        name: block.name,
        input: block.input,
      })
    }
  }
  return { role: 'assistant', content: blocks.length > 0 ? blocks : state.text }
}

function toAssistantMessage(state: AnthropicAssistantState): Extract<Message, { role: 'assistant' }> {
  const toolCalls = state.content
    .filter((block): block is AnthropicToolUseBlock => block?.type === 'tool_use')
    .map(block => ({
      id: block.id,
      type: 'function' as const,
      function: {
        name: block.name,
        arguments: JSON.stringify(block.input ?? {}),
      },
    }))

  return {
    role: 'assistant',
    content: state.text,
    ...(state.reasoning ? { reasoning: state.reasoning } : {}),
    ...(toolCalls.length > 0 ? { tool_calls: toolCalls } : {}),
  }
}

function toAnthropicTools(tools: Tool[]): AnthropicTool[] {
  return tools.map(tool => ({
    name: tool.function.name,
    description: tool.function.description,
    input_schema: toInputSchema(tool.function.parameters),
  }))
}

function toInputSchema(parameters: Record<string, unknown>): AnthropicTool['input_schema'] {
  if (parameters.type === 'object') {
    return {
      type: 'object',
      properties: (parameters.properties ?? {}) as Record<string, unknown>,
      ...(Array.isArray(parameters.required) ? { required: parameters.required as string[] } : {}),
    }
  }

  return {
    type: 'object',
    properties: parameters as Record<string, unknown>,
  }
}

function toUsage(state: AnthropicAssistantState): LlmUsage {
  if (state.inputTokens === 0 && state.outputTokens === 0)
    return { source: 'unavailable' }

  return {
    inputTokens: state.inputTokens,
    outputTokens: state.outputTokens,
    totalTokens: state.inputTokens + state.outputTokens,
    source: 'reported',
  }
}

function parseToolInput(value: string): Record<string, unknown> {
  if (!value.trim())
    return {}
  try {
    const parsed = JSON.parse(value) as unknown
    if (typeof parsed === 'object' && parsed != null && !Array.isArray(parsed))
      return parsed as Record<string, unknown>
    return {}
  }
  catch {
    return {}
  }
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

function anthropicClientAuth(headers: Record<string, string>): {
  apiKey: string | null
  authToken: string | null
  defaultHeaders: Record<string, string | null>
} {
  let apiKey: string | null = null
  let authToken: string | null = null
  for (const [name, value] of Object.entries(headers)) {
    const key = name.toLowerCase()
    if (key === 'x-api-key' && value)
      apiKey = value
    if (key === 'authorization') {
      const bearer = value.match(/^Bearer\s+(\S+)/i)
      if (bearer?.[1])
        authToken = bearer[1]
    }
  }

  if (apiKey)
    return { apiKey, authToken: null, defaultHeaders: headers }
  if (authToken)
    return { apiKey: null, authToken, defaultHeaders: headers }
  return {
    apiKey: null,
    authToken: null,
    defaultHeaders: {
      ...headers,
      'X-Api-Key': null,
      'Authorization': null,
    },
  }
}
