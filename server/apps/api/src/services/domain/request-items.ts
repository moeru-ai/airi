import type { RequestContent } from './request-content'

import { array, literal, looseObject, nullish, number, optional, picklist, safeParse, string, union, unknown } from 'valibot'

export interface RequestItem {
  kind: 'user_message' | 'assistant_message' | 'tool_call' | 'tool_result'
  text?: string
  toolName?: string
  toolCallId?: string
  truncated: boolean
}

type Item = Omit<RequestItem, 'truncated'>

/** Bounds one item. The complete content stays in the request log. */
const textLimit = 256 * 1024
const encoder = new TextEncoder()
const decoder = new TextDecoder()

/** Content is null when an assistant message holds only tool calls. */
const contentSchema = nullish(union([string(), array(unknown())]))
const textPartSchema = looseObject({ type: picklist(['text', 'input_text', 'output_text']), text: string() })
const refusalPartSchema = looseObject({ type: literal('refusal'), refusal: string() })
const chatCallSchema = looseObject({
  id: optional(string()),
  function: optional(looseObject({ name: optional(string()), arguments: optional(string()) })),
})
const chatPromptSchema = looseObject({
  messages: array(looseObject({ role: optional(string()), content: contentSchema, tool_call_id: optional(string()) })),
})
const responsesPromptSchema = looseObject({ input: union([string(), array(unknown())]) })
const inputItemSchema = looseObject({
  type: optional(string()),
  role: optional(string()),
  content: contentSchema,
  call_id: optional(string()),
  output: optional(unknown()),
})
const chatBodySchema = looseObject({
  choices: array(looseObject({ message: optional(looseObject({ content: contentSchema, refusal: nullish(string()), tool_calls: optional(array(unknown())) })) })),
})
const outputItemSchema = looseObject({
  type: optional(string()),
  id: optional(string()),
  call_id: optional(string()),
  name: optional(string()),
  arguments: optional(string()),
  input: optional(string()),
  content: contentSchema,
})
const responsesBodySchema = looseObject({ output: array(unknown()) })
const chatChunkSchema = looseObject({
  choices: array(looseObject({
    index: optional(number()),
    delta: optional(looseObject({
      content: nullish(string()),
      refusal: nullish(string()),
      tool_calls: optional(array(looseObject({
        index: optional(number()),
        id: optional(string()),
        function: optional(looseObject({ name: optional(string()), arguments: optional(string()) })),
      }))),
    })),
  })),
})
const outputItemEventSchema = looseObject({
  type: picklist(['response.output_item.added', 'response.output_item.done']),
  item: outputItemSchema,
})
const deltaEventSchema = looseObject({
  type: picklist(['response.function_call_arguments.delta', 'response.output_text.delta', 'response.refusal.delta']),
  item_id: string(),
  delta: string(),
})
const terminalEventSchema = looseObject({
  type: picklist(['response.completed', 'response.incomplete']),
  response: looseObject({ output: optional(array(unknown())) }),
})
/** Built-in tools of the Responses protocol use one item type each, such as `web_search_call` or `mcp_call`. */
const callTypePattern = /^(.+)_call$/
/** Fields of a built-in call that say what the model asked for. The other fields are status and results. */
const callRequestKeys = ['action', 'queries', 'code', 'server_label']

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

function contentText(content: string | unknown[] | null | undefined) {
  if (content == null)
    return undefined
  if (typeof content === 'string')
    return content
  const parts = content.flatMap((part) => {
    const parsed = safeParse(textPartSchema, part)
    if (parsed.success)
      return [parsed.output.text]
    const refusal = safeParse(refusalPartSchema, part)
    return refusal.success ? [refusal.output.refusal] : []
  })
  return parts.length > 0 ? parts.join('\n') : undefined
}

function bounded(item: Item): RequestItem {
  if (item.text === undefined)
    return { ...item, truncated: false }
  const bytes = encoder.encode(item.text)
  if (bytes.byteLength <= textLimit)
    return { ...item, truncated: false }
  return { ...item, text: decoder.decode(bytes.subarray(0, textLimit), { stream: true }), truncated: true }
}

function chatInput(messages: Array<{ role?: string, content?: string | unknown[] | null, tool_call_id?: string }>): Item[] {
  const start = messages.findLastIndex(message => message.role === 'assistant') + 1
  return messages.slice(start).flatMap((message): Item[] => {
    if (message.role === 'user')
      return [{ kind: 'user_message', text: contentText(message.content) }]
    if (message.role === 'tool' || message.role === 'function')
      return [{ kind: 'tool_result', text: contentText(message.content), toolCallId: message.tool_call_id }]
    return []
  })
}

function responsesInput(input: string | unknown[]): Item[] {
  if (typeof input === 'string')
    return [{ kind: 'user_message', text: input }]
  const items = input.flatMap((value) => {
    const parsed = safeParse(inputItemSchema, value)
    return parsed.success ? [parsed.output] : []
  })
  const start = items.findLastIndex(item => item.role === 'assistant' || item.type === 'reasoning' || callTypePattern.test(item.type ?? '')) + 1
  return items.slice(start).flatMap((item): Item[] => {
    if (item.type === 'function_call_output' || item.type === 'custom_tool_call_output') {
      const text = typeof item.output === 'string' ? item.output : item.output === undefined ? undefined : JSON.stringify(item.output)
      return [{ kind: 'tool_result', text, toolCallId: item.call_id }]
    }
    if (item.role === 'user')
      return [{ kind: 'user_message', text: contentText(item.content) }]
    return []
  })
}

function outputItem(value: unknown): Item[] {
  const parsed = safeParse(outputItemSchema, value)
  if (!parsed.success)
    return []
  const item = parsed.output
  const call = item.type?.match(callTypePattern)
  if (call) {
    // A function, custom, or MCP call names its tool. A built-in call is named by its item type.
    const request = Object.fromEntries(callRequestKeys.filter(key => item[key] !== undefined).map(key => [key, item[key]]))
    const text = item.arguments ?? item.input ?? (Object.keys(request).length > 0 ? JSON.stringify(request) : undefined)
    return [{ kind: 'tool_call', text, toolName: item.name ?? call[1], toolCallId: item.call_id ?? item.id }]
  }
  const text = item.type === 'message' ? contentText(item.content) : undefined
  return text ? [{ kind: 'assistant_message', text }] : []
}

function bodyOutput(body: unknown): Item[] {
  const chat = safeParse(chatBodySchema, body)
  if (chat.success) {
    return chat.output.choices.flatMap((choice): Item[] => {
      const text = contentText(choice.message?.content) ?? choice.message?.refusal
      const calls = (choice.message?.tool_calls ?? []).flatMap((value): Item[] => {
        const call = safeParse(chatCallSchema, value)
        return call.success ? [{ kind: 'tool_call', text: call.output.function?.arguments, toolName: call.output.function?.name, toolCallId: call.output.id }] : []
      })
      return text ? [{ kind: 'assistant_message', text }, ...calls] : calls
    })
  }
  const responses = safeParse(responsesBodySchema, body)
  return responses.success ? responses.output.output.flatMap(outputItem) : []
}

function streamOutput(events: unknown[]): Item[] {
  // A Chat Completions call arrives as deltas that share one index inside one choice.
  // Each choice numbers its calls from 0. A missing index means 0.
  const choices = new Map<number, { text: string, calls: Map<number, Item> }>()
  // A Responses item arrives as item events and deltas that share the item ID.
  const streamed = new Map<string, Item>()
  let terminal: Item[] = []
  for (const event of events) {
    const chunk = safeParse(chatChunkSchema, event)
    if (chunk.success) {
      for (const piece of chunk.output.choices) {
        const index = piece.index ?? 0
        const choice = choices.get(index) ?? { text: '', calls: new Map<number, Item>() }
        choices.set(index, choice)
        choice.text += piece.delta?.content ?? piece.delta?.refusal ?? ''
        for (const delta of piece.delta?.tool_calls ?? []) {
          const position = delta.index ?? 0
          const call = choice.calls.get(position) ?? { kind: 'tool_call' }
          choice.calls.set(position, {
            kind: 'tool_call',
            text: delta.function?.arguments === undefined ? call.text : (call.text ?? '') + delta.function.arguments,
            toolName: delta.function?.name ?? call.toolName,
            toolCallId: delta.id ?? call.toolCallId,
          })
        }
      }
      continue
    }
    const itemEvent = safeParse(outputItemEventSchema, event)
    if (itemEvent.success) {
      const id = itemEvent.output.item.id
      const [item] = outputItem(itemEvent.output.item)
      if (!id || !item)
        continue
      const earlier = streamed.get(id)
      // The added event has empty content. The deltas that follow fill it, and the done event replaces it.
      streamed.set(id, itemEvent.output.type === 'response.output_item.done' || !earlier ? item : earlier)
      continue
    }
    const delta = safeParse(deltaEventSchema, event)
    if (delta.success) {
      const earlier = streamed.get(delta.output.item_id)
      const kind = delta.output.type === 'response.function_call_arguments.delta' ? 'tool_call' : 'assistant_message'
      streamed.set(delta.output.item_id, { ...earlier, kind, text: (earlier?.text ?? '') + delta.output.delta })
      continue
    }
    // The terminal event repeats the complete output. A stream can hold only this event.
    const done = safeParse(terminalEventSchema, event)
    if (done.success)
      terminal = (done.output.response.output ?? []).flatMap(outputItem)
  }
  const chat = [...choices.entries()].sort(([a], [b]) => a - b).flatMap(([, choice]): Item[] => {
    const calls = [...choice.calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => call)
    return choice.text ? [{ kind: 'assistant_message', text: choice.text }, ...calls] : calls
  })
  const responses = terminal.length > 0 ? terminal : [...streamed.values()].filter(item => item.kind === 'tool_call' || item.text)
  return [...chat, ...responses]
}

/**
 * Lists the items that one request added to the conversation.
 *
 * Each request repeats the earlier conversation, so only the items after the last item that the model wrote are new.
 * System and developer messages are not items.
 *
 * Returns no items when the prompt is a text preview, because a truncated body cannot be read as JSON.
 */
export function splitInputItems(prompt: RequestContent): RequestItem[] {
  if (prompt.format !== 'json')
    return []
  const body = parseJson(prompt.text)
  const chat = safeParse(chatPromptSchema, body)
  if (chat.success)
    return chatInput(chat.output.messages).map(bounded)
  const responses = safeParse(responsesPromptSchema, body)
  return responses.success ? responsesInput(responses.output.input).map(bounded) : []
}

/**
 * Lists the messages and tool calls that the model wrote in one stored completion.
 *
 * Reasoning is not an item. A stream that stops inside an event gives the items of the complete events.
 */
export function splitOutputItems(completion: RequestContent): RequestItem[] {
  if (completion.format === 'json')
    return bodyOutput(parseJson(completion.text)).map(bounded)
  if (completion.format === 'sse')
    return streamOutput(completion.text.split('\n\n').map(parseJson)).map(bounded)
  return []
}
