import type { Message as ChatMessage, CommonContentPart } from '@xsai/shared-chat'

import type { ConversationContext, InputSegment, Message, MessageSegment } from './types'

import { renderSegmentText } from './render-context'

/**
 * Converts Chat content at storage and SDK boundaries without inventing a message envelope.
 *
 * @example
 * readChatContent('hello')
 * // => [{ type: 'text', text: 'hello' }]
 */
export function readChatContent(content: string | CommonContentPart[] | undefined): InputSegment[] {
  if (content == null)
    return []
  if (typeof content === 'string')
    return [{ type: 'text', text: content }]
  return content.map((part) => {
    switch (part.type) {
      case 'text': return { type: 'text', text: part.text }
      case 'image_url': return { type: 'image', url: part.image_url.url, detail: part.image_url.detail }
      case 'input_audio': return { type: 'audio', ...part.input_audio }
      case 'file':
        if (part.file.file_data !== undefined && part.file.file_id === undefined)
          return { type: 'file', data: part.file.file_data, name: part.file.filename }
        if (part.file.file_id !== undefined && part.file.file_data === undefined)
          return { type: 'file', providerFileId: part.file.file_id, name: part.file.filename }
        throw new Error('Chat file requires exactly one source')
    }
    throw new Error('Unsupported Chat content part')
  })
}

/**
 * Reads Chat-shaped storage or SDK output into portable message semantics.
 * This is an ingress boundary; Responses never calls the Chat request renderer.
 *
 * @example
 * readChatMessages([{ role: 'user', content: 'Hello' }])[0].segments
 * // => [{ type: 'text', text: 'Hello' }]
 */
export function readChatMessages(messages: (ChatMessage | { role: 'error', content: string })[]): Message[] {
  return messages.map((message, index) => {
    const id = `message-${index}`
    if (message.role === 'error')
      return { id, role: 'user', segments: [{ type: 'text', text: `User encountered error: ${message.content}` }] }
    if (message.role === 'tool')
      return { id, role: 'tool', segments: [{ type: 'tool-result', callId: message.tool_call_id, content: readChatContent(message.content) }] }
    if (message.role === 'assistant') {
      const segments: Extract<Message, { role: 'assistant' }>['segments'] = typeof message.content === 'string'
        ? [{ type: 'text', text: message.content }]
        : message.content?.map(part => part.type === 'text' ? { type: 'text', text: part.text } : { type: 'refusal', text: part.refusal }) ?? []
      if (message.refusal)
        segments.push({ type: 'refusal', text: message.refusal })
      for (const call of message.tool_calls ?? []) {
        if (call.function.name == null || call.function.arguments == null)
          throw new Error('Cannot replay an unfinished function call')
        segments.push({ type: 'tool-call', callId: call.id, name: call.function.name, arguments: call.function.arguments })
      }
      return { id, role: 'assistant', segments }
    }
    if (message.role === 'system' || message.role === 'developer')
      return { id, role: message.role, segments: typeof message.content === 'string' ? [{ type: 'text', text: message.content }] : message.content.map(part => ({ type: 'text', text: part.text })) }
    return { id, role: message.role, segments: readChatContent(message.content) }
  })
}

function writeContent(segment: MessageSegment): CommonContentPart {
  switch (segment.type) {
    case 'image': return { type: 'image_url', image_url: { url: segment.url, detail: segment.detail } }
    case 'audio': return { type: 'input_audio', input_audio: { data: segment.data, format: segment.format } }
    case 'file':
      if (segment.url)
        throw new Error('Chat Completions does not support file URLs')
      return { type: 'file', file: { file_data: segment.data, filename: segment.name, file_id: segment.providerFileId } }
    default: return { type: 'text', text: renderSegmentText(segment) }
  }
}

/**
 * Projects context directly into Chat Completions messages.
 * Array compatibility applies only here. Only matching Chat continuation can bypass portable projection.
 * Pure-text arrays become strings. With array support disabled, non-text parts are omitted.
 * Input messages and provider extension fields remain unchanged.
 */
export function renderChatContext(context: ConversationContext, supportsContentArray = true, scope?: string): ChatMessage[] {
  // NOTICE:
  // Some compatible servers reject content arrays with "invalid type: sequence, expected a string".
  // They implement only the string variant of Chat Completions content.
  // Source/context: https://github.com/moeru-ai/airi/issues/1500
  // Removal condition: All supported endpoints accept content arrays.
  return context.turns.flatMap((turn) => {
    if (scope && turn.continuation?.protocol === 'chat-completions' && turn.continuation.scope === scope) {
      // Keep provider reasoning fields on unchanged local turns. These fields
      // cannot be reconstructed from UI speech or portable tool messages.
      if (!Array.isArray(turn.continuation.data))
        throw new Error('Chat continuation must contain a message array')
      return turn.continuation.data.map((message) => {
        if (Array.isArray(message.content) && (!supportsContentArray || message.content.every(part => part.type === 'text')) && !message.content.some(part => part.type === 'refusal'))
          return { ...message, content: message.content.map(part => part.type === 'text' ? part.text : '').join('') }
        return message
      })
    }
    return turn.messages.flatMap<ChatMessage>((message) => {
      const result: ChatMessage[] = []
      const role = message.role === 'context' || message.role === 'event' || message.role === 'summary' ? 'user' : message.role
      let parts: CommonContentPart[] = []
      let assistantParts: Array<{ type: 'text', text: string } | { type: 'refusal', refusal: string }> = []
      let calls: NonNullable<Extract<ChatMessage, { role: 'assistant' }>['tool_calls']> = []
      function flush() {
        if (role === 'assistant') {
          if (assistantParts.length || calls.length) {
            const content = assistantParts.every(part => part.type === 'text')
              ? assistantParts.map(part => part.text).join('')
              : assistantParts
            result.push({ role, content, ...(calls.length ? { tool_calls: calls } : {}) })
          }
        }
        else if (parts.length) {
          if (role === 'tool')
            throw new Error('Tool messages require a correlated tool result')
          if (role === 'system' || role === 'developer') {
            if (parts.some(part => part.type !== 'text'))
              throw new Error(`${role} messages require text content`)
            result.push({ role, content: parts.map(part => part.type === 'text' ? part.text : '').join('') })
          }
          else {
            const content = !supportsContentArray || parts.every(part => part.type === 'text')
              ? parts.map(part => part.type === 'text' ? part.text : '').join('')
              : parts
            result.push({ role, content })
          }
        }
        parts = []
        assistantParts = []
        calls = []
      }
      for (const segment of message.segments) {
        if (segment.type === 'tool-result') {
          flush()
          const content = segment.content.map(writeContent)
          result.push({ role: 'tool', tool_call_id: segment.callId, content: !supportsContentArray || content.every(part => part.type === 'text') ? content.map(part => part.type === 'text' ? part.text : '').join('') : content })
        }
        else if (segment.type === 'tool-call') {
          if (role !== 'assistant')
            throw new Error('Only assistant messages can invoke tools')
          calls.push({ type: 'function', id: segment.callId, function: { name: segment.name, arguments: segment.arguments } })
        }
        else {
          if (calls.length)
            flush()
          if (role === 'assistant') {
            if (segment.type === 'refusal')
              assistantParts.push({ type: 'refusal', refusal: segment.text })
            else
              assistantParts.push({ type: 'text', text: renderSegmentText(segment) })
          }
          else {
            parts.push(writeContent(segment))
          }
        }
      }
      flush()
      return result
    })
  })
}
