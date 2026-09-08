import type { ResponsesConfig } from '@proj-airi/provider-inference'
import type { ItemParam, ResponsesOptions } from '@xsai-ext/responses'
import type { Tool } from '@xsai/shared-chat'

import type { Citation, ConversationContext, ConversationTurn, InputSegment, Message, MessageSegment } from '../messages/types'
import type { StreamEvent, StreamOptions } from '../types/llm'

import { responses } from '@xsai-ext/responses'
import { stepCountAtLeast } from '@xsai/shared-chat'

import { renderSegmentText } from '../messages/render-context'
import { toAiriStreamEvent } from './xsai-events'

type InputContent = Exclude<Extract<ItemParam, { role: 'user' }>['content'], string>

function inputPart(segment: MessageSegment): InputContent[number] {
  switch (segment.type) {
    case 'image': return { type: 'input_image', image_url: segment.url, detail: segment.detail }
    case 'file':
      if (segment.providerFileId)
        throw new Error('Responses file references require native input Items')
      return { type: 'input_file', file_data: segment.data, filename: segment.name, file_url: segment.url }
    case 'audio': throw new Error('This Responses adapter does not support audio input')
    default: return { type: 'input_text', text: renderSegmentText(segment) }
  }
}

function renderMessage(message: Message): ItemParam[] {
  const items: ItemParam[] = []
  const role = message.role === 'context' || message.role === 'event' || message.role === 'summary' ? 'user' : message.role
  let parts: MessageSegment[] = []
  function flush() {
    if (!parts.length)
      return
    if (role === 'tool')
      throw new Error('Tool messages require a correlated tool result')
    if (role === 'assistant') {
      const content = parts.map(part => part.type === 'refusal'
        ? { type: 'refusal' as const, refusal: part.text }
        : { type: 'output_text' as const, text: renderSegmentText(part) })
      items.push({ type: 'message', role, content })
    }
    else if (role === 'user') {
      const content = parts.map(inputPart)
      items.push({ type: 'message', role, content: content.every(part => part.type === 'input_text') ? content.map(part => part.text).join('') : content })
    }
    else {
      items.push({ type: 'message', role, content: parts.map(part => ({ type: 'input_text', text: renderSegmentText(part) })) })
    }
    parts = []
  }
  for (const segment of message.segments) {
    if (segment.type === 'tool-call') {
      if (role !== 'assistant')
        throw new Error('Only assistant messages can invoke tools')
      flush()
      items.push({ type: 'function_call', call_id: segment.callId, name: segment.name, arguments: segment.arguments })
    }
    else if (segment.type === 'tool-result') {
      flush()
      const content = segment.content.map(inputPart)
      items.push({ type: 'function_call_output', call_id: segment.callId, output: content.every(part => part.type === 'input_text') ? content.map(part => part.text).join('') : content })
    }
    else {
      parts.push(segment)
    }
  }
  flush()
  return items
}

function renderContext(context: ConversationContext, scope: string): ItemParam[] {
  return context.turns.flatMap((turn) => {
    if (turn.continuation?.protocol === 'responses' && turn.continuation.scope === scope) {
      if (!Array.isArray(turn.continuation.data))
        throw new Error('Responses continuation must contain an item array')
      // The provider owns nested native fields, including tools this adapter does not interpret.
      // Do not reconstruct SDK output through a partial schema before replay.
      return turn.continuation.data
    }
    // A protocol or scope change intentionally uses portable messages. Native
    // encrypted reasoning and provider ids cannot cross this ownership boundary.
    return turn.messages.flatMap(renderMessage)
  })
}

function readInputContent(content: Extract<ItemParam, { type: 'function_call_output' }>['output']): InputSegment[] {
  if (typeof content === 'string')
    return [{ type: 'text', text: content }]
  return content.map((part) => {
    switch (part.type) {
      case 'input_text': return { type: 'text', text: part.text }
      case 'input_image':
        if (!part.image_url)
          throw new Error('Responses image output requires a URL')
        return { type: 'image', url: part.image_url, detail: part.detail ?? undefined }
      case 'input_file':
        if (part.file_data != null && part.file_url == null)
          return { type: 'file', data: part.file_data, name: part.filename ?? undefined }
        if (part.file_url != null && part.file_data == null)
          return { type: 'file', url: part.file_url, name: part.filename ?? undefined }
        throw new Error('Responses file requires exactly one source')
      case 'input_video': throw new Error('Video tool output is not supported by the conversation model')
    }
    throw new Error('Unsupported Responses tool output')
  })
}

type AssistantContent = Exclude<Extract<ItemParam, { role: 'assistant' }>['content'], string>[number]

function readCitations(part: Extract<AssistantContent, { type: 'output_text' }>): Citation[] | undefined {
  return part.annotations?.map(entry => ({
    url: entry.url,
    title: entry.title,
    startIndex: entry.start_index,
    endIndex: entry.end_index,
  }))
}

function readOutput(items: ItemParam[]): Message[] {
  return items.flatMap<Message>((item, index) => {
    const id = `output-${index}`
    if (item.type === 'function_call')
      return [{ id, role: 'assistant', segments: [{ type: 'tool-call', callId: item.call_id, name: item.name, arguments: item.arguments }] }]
    if (item.type === 'function_call_output')
      return [{ id, role: 'tool', segments: [{ type: 'tool-result', callId: item.call_id, content: readInputContent(item.output) }] }]
    if (item.type === 'message' && item.role === 'assistant') {
      const segments: Extract<Message, { role: 'assistant' }>['segments'] = typeof item.content === 'string'
        ? [{ type: 'text', text: item.content }]
        : item.content.map((part) => {
            if (part.type === 'output_text')
              return { type: 'text', text: part.text, citations: readCitations(part) }
            return { type: 'refusal', text: part.refusal }
          })
      return [{ id, role: 'assistant', segments }]
    }
    // Reasoning and compaction are replayed through adapter continuation data.
    // They are not instructions or assistant speech in a different protocol.
    return []
  })
}

function toolChoice(choice: StreamOptions['toolChoice']): ResponsesOptions['toolChoice'] {
  if (choice == null || typeof choice === 'string')
    return choice
  if (choice.type === 'function')
    return { type: 'function', name: choice.function.name }
  return { type: 'allowed_tools', mode: choice.mode, tools: choice.tools.map(tool => ({ type: 'function', name: tool.function.name })) }
}

/**
 * Projects context directly into Responses and runs stateless tool steps.
 * Only a fully settled generation produces a transcript for the caller to commit.
 */
export function streamResponses(input: {
  config: ResponsesConfig
  webSearch?: boolean
  context: ConversationContext
  scope: string
  options?: StreamOptions
  tools?: Tool[]
  onEvent: (event: StreamEvent) => Promise<void>
}) {
  const items = renderContext(input.context, input.scope)
  const result = responses({
    ...input.config,
    input: items,
    store: false,
    include: ['reasoning.encrypted_content'],
    abortSignal: input.options?.abortSignal,
    headers: { ...Object.fromEntries(new Headers(input.config.headers)), ...input.options?.headers },
    tools: input.webSearch ? [...(input.tools ?? []), { type: 'web_search' }] : input.tools,
    toolChoice: toolChoice(input.options?.toolChoice),
    stopWhen: stepCountAtLeast(10),
    onEvent: async (event) => {
      const mapped = toAiriStreamEvent(event)
      if (mapped)
        await input.onEvent(mapped)
    },
    onNativeEvent: async (event) => {
      if (event.type !== 'response.output_item.done' && event.type !== 'response.output_item.added')
        return
      const item = event.item
      if (item?.type === 'web_search_call')
        await input.onEvent({ type: 'search', id: item.id, status: item.status })
      if (event.type === 'response.output_item.done' && item?.type === 'message' && item.role === 'assistant') {
        for (const part of item.content) {
          if (part.type !== 'output_text')
            continue
          const citations = readCitations(part)
          if (citations?.length)
            await input.onEvent({ type: 'citations', citations })
        }
      }
    },
  })
  const transcript = result.input.then(async (finalInput): Promise<ConversationTurn> => {
    const lastStep = (await result.steps).at(-1)
    if (lastStep?.finishReason === 'tool-calls' && lastStep.toolResults.length === 0)
      throw new Error('Responses tool step limit reached')
    const output = finalInput.slice(items.length)
    if (!output.length)
      return { messages: [] }
    return { messages: readOutput(output), continuation: { protocol: 'responses', scope: input.scope, data: output } }
  })
  return { ...result, transcript }
}
