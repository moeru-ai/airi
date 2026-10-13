import type { RequestContent } from './request-content'

import { array, literal, looseObject, nullish, number, optional, picklist, safeParse, string, union, unknown } from 'valibot'

/** Increase when a parser change changes the stored rows, so old rows can be built again. */
export const requestItemParserVersion = 1

export interface RequestItem {
  role: 'user' | 'assistant' | 'tool'
  partType: 'text' | 'refusal' | 'tool_call' | 'tool_call_response' | 'server_tool_call'
  text?: string
  toolName?: string
  toolCallId?: string
  arguments?: unknown
  attributes?: { choice?: number, serverLabel?: string }
  truncated: boolean
}

/**
 * A part before its arguments are parsed and its size is bounded.
 *
 * `argumentsJson` is the argument text of a call, which a stream can stop inside.
 * `input` is the free text input of a custom tool, which is never parsed.
 */
interface Part extends Omit<RequestItem, 'arguments' | 'truncated'> {
  argumentsJson?: string
  input?: string
  request?: Record<string, unknown>
}

/** Bounds one item. The complete content stays in the request log. */
const textLimit = 256 * 1024
const encoder = new TextEncoder()

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
  server_label: optional(string()),
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
/** Each tool of the Responses protocol uses one item type, such as `function_call` or `web_search_call`. */
const callTypePattern = /^(.+)_call$/
const resultTypePattern = /_call_output$/
/**
 * The calls that the client runs and answers with a `<type>_output` item.
 * Every other call type runs at the provider. A new type is a provider call until it is listed here,
 * so a trace never waits for a client result that does not come.
 */
const clientCallTypes = new Set(['function_call', 'custom_tool_call', 'computer_call', 'local_shell_call'])
/** Fields of a call that say what the model asked for. The other fields are status and results. */
const callRequestKeys = ['action', 'queries', 'code', 'prompt']

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

function joined(texts: string[]) {
  return texts.length > 0 ? texts.join('\n') : undefined
}

/** Splits the content of a message into its text and its refusal. */
function contentParts(content: string | unknown[] | null | undefined) {
  if (content == null)
    return {}
  if (typeof content === 'string')
    return { text: content }
  const texts: string[] = []
  const refusals: string[] = []
  for (const part of content) {
    const text = safeParse(textPartSchema, part)
    if (text.success)
      texts.push(text.output.text)
    const refusal = safeParse(refusalPartSchema, part)
    if (refusal.success)
      refusals.push(refusal.output.refusal)
  }
  return { text: joined(texts), refusal: joined(refusals) }
}

function assistantParts(content: { text?: string, refusal?: string }, attributes?: Part['attributes']): Part[] {
  return [
    ...(content.text ? [{ role: 'assistant' as const, partType: 'text' as const, text: content.text, attributes }] : []),
    ...(content.refusal ? [{ role: 'assistant' as const, partType: 'refusal' as const, text: content.refusal, attributes }] : []),
  ]
}

function cut(text: string) {
  const bytes = encoder.encode(text)
  if (bytes.byteLength <= textLimit)
    return { text, truncated: false }
  // A new decoder for each cut drops a character that the limit splits. A shared streaming decoder would keep its bytes for the next item.
  return { text: new TextDecoder().decode(bytes.subarray(0, textLimit), { stream: true }), truncated: true }
}

/** Parses the arguments of a part and bounds its text and arguments. */
function finish(part: Part): RequestItem {
  const { argumentsJson, input, request, attributes, text, ...rest } = part
  const item: RequestItem = { ...rest, truncated: false }
  if (attributes && Object.values(attributes).some(value => value !== undefined))
    item.attributes = attributes
  if (text !== undefined) {
    const bounded = cut(text)
    item.text = bounded.text
    item.truncated = bounded.truncated
  }
  // Arguments that are not valid JSON, such as the arguments of a stream that stopped, are kept as one string.
  const value = input ?? (argumentsJson === undefined ? request : (parseJson(argumentsJson) ?? argumentsJson))
  if (value === undefined)
    return item
  const serialized = JSON.stringify(value)
  if (encoder.encode(serialized).byteLength <= textLimit) {
    item.arguments = value
    return item
  }
  item.arguments = cut(serialized).text
  item.truncated = true
  return item
}

function chatInput(messages: Array<{ role?: string, content?: string | unknown[] | null, tool_call_id?: string }>): Part[] {
  const start = messages.findLastIndex(message => message.role === 'assistant') + 1
  return messages.slice(start).flatMap((message): Part[] => {
    if (message.role === 'user')
      return [{ role: 'user', partType: 'text', text: contentParts(message.content).text }]
    if (message.role === 'tool' || message.role === 'function')
      return [{ role: 'tool', partType: 'tool_call_response', text: contentParts(message.content).text, toolCallId: message.tool_call_id }]
    return []
  })
}

function responsesInput(input: string | unknown[]): Part[] {
  if (typeof input === 'string')
    return [{ role: 'user', partType: 'text', text: input }]
  const items = input.flatMap((value) => {
    const parsed = safeParse(inputItemSchema, value)
    return parsed.success ? [parsed.output] : []
  })
  const start = items.findLastIndex(item => item.role === 'assistant' || item.type === 'reasoning' || callTypePattern.test(item.type ?? '')) + 1
  return items.slice(start).flatMap((item): Part[] => {
    if (resultTypePattern.test(item.type ?? '')) {
      const text = typeof item.output === 'string' ? item.output : item.output === undefined ? undefined : JSON.stringify(item.output)
      return [{ role: 'tool', partType: 'tool_call_response', text, toolCallId: item.call_id }]
    }
    if (item.role === 'user')
      return [{ role: 'user', partType: 'text', text: contentParts(item.content).text }]
    return []
  })
}

function outputItem(value: unknown): Part[] {
  const parsed = safeParse(outputItemSchema, value)
  if (!parsed.success)
    return []
  const item = parsed.output
  const call = item.type?.match(callTypePattern)
  if (call) {
    const request = Object.fromEntries(callRequestKeys.filter(key => item[key] !== undefined).map(key => [key, item[key]]))
    return [{
      role: 'assistant',
      partType: clientCallTypes.has(call[0]) ? 'tool_call' : 'server_tool_call',
      // A function, custom, or MCP call names its tool. A built-in call is named by its item type.
      toolName: item.name ?? call[1],
      toolCallId: item.call_id ?? item.id,
      argumentsJson: item.arguments,
      input: item.input,
      request: Object.keys(request).length > 0 ? request : undefined,
      attributes: { serverLabel: item.server_label },
    }]
  }
  return item.type === 'message' ? assistantParts(contentParts(item.content)) : []
}

function chatCalls(values: unknown[], attributes?: Part['attributes']): Part[] {
  return values.flatMap((value): Part[] => {
    const call = safeParse(chatCallSchema, value)
    return call.success
      ? [{ role: 'assistant', partType: 'tool_call', toolName: call.output.function?.name, toolCallId: call.output.id, argumentsJson: call.output.function?.arguments, attributes }]
      : []
  })
}

/** The choice index is kept only when a response has more than one choice. */
function choiceAttributes(index: number, count: number) {
  return count > 1 ? { choice: index } : undefined
}

function bodyOutput(body: unknown): Part[] {
  const chat = safeParse(chatBodySchema, body)
  if (chat.success) {
    const count = chat.output.choices.length
    return chat.output.choices.flatMap((choice, index): Part[] => {
      const attributes = choiceAttributes(index, count)
      const content = contentParts(choice.message?.content)
      return [
        ...assistantParts({ text: content.text, refusal: content.refusal ?? choice.message?.refusal ?? undefined }, attributes),
        ...chatCalls(choice.message?.tool_calls ?? [], attributes),
      ]
    })
  }
  const responses = safeParse(responsesBodySchema, body)
  return responses.success ? responses.output.output.flatMap(outputItem) : []
}

function isCall(partType: RequestItem['partType']) {
  return partType === 'tool_call' || partType === 'server_tool_call'
}

/** A call item is one part. A message item can hold a text part and a refusal part. */
function streamKey(id: string, partType: RequestItem['partType']) {
  return isCall(partType) ? id : `${id}:${partType}`
}

function streamOutput(events: unknown[]): Part[] {
  // A Chat Completions call arrives as deltas that share one index inside one choice.
  // Each choice numbers its calls from 0. A missing index means 0.
  const choices = new Map<number, { text: string, refusal: string, calls: Map<number, Part> }>()
  // A Responses part arrives as item events and deltas that share the item ID.
  const streamed = new Map<string, Part>()
  let terminal: Part[] = []
  for (const event of events) {
    const chunk = safeParse(chatChunkSchema, event)
    if (chunk.success) {
      for (const piece of chunk.output.choices) {
        const index = piece.index ?? 0
        const choice = choices.get(index) ?? { text: '', refusal: '', calls: new Map<number, Part>() }
        choices.set(index, choice)
        choice.text += piece.delta?.content ?? ''
        choice.refusal += piece.delta?.refusal ?? ''
        for (const delta of piece.delta?.tool_calls ?? []) {
          const position = delta.index ?? 0
          const call = choice.calls.get(position)
          choice.calls.set(position, {
            role: 'assistant',
            partType: 'tool_call',
            argumentsJson: delta.function?.arguments === undefined ? call?.argumentsJson : (call?.argumentsJson ?? '') + delta.function.arguments,
            toolName: delta.function?.name ?? call?.toolName,
            toolCallId: delta.id ?? call?.toolCallId,
          })
        }
      }
      continue
    }
    const itemEvent = safeParse(outputItemEventSchema, event)
    if (itemEvent.success) {
      const id = itemEvent.output.item.id
      if (!id)
        continue
      for (const part of outputItem(itemEvent.output.item)) {
        const key = streamKey(id, part.partType)
        // The added event has empty content. The deltas that follow fill it, and the done event replaces it.
        if (itemEvent.output.type === 'response.output_item.done' || !streamed.has(key))
          streamed.set(key, part)
      }
      continue
    }
    const delta = safeParse(deltaEventSchema, event)
    if (delta.success) {
      const { type, item_id: id } = delta.output
      if (type === 'response.function_call_arguments.delta') {
        const call = streamed.get(id)
        if (call)
          call.argumentsJson = (call.argumentsJson ?? '') + delta.output.delta
        continue
      }
      const partType = type === 'response.refusal.delta' ? 'refusal' : 'text'
      const key = streamKey(id, partType)
      const earlier = streamed.get(key)
      streamed.set(key, { role: 'assistant', partType, text: (earlier?.text ?? '') + delta.output.delta })
      continue
    }
    // The terminal event repeats the complete output. A stream can hold only this event.
    const done = safeParse(terminalEventSchema, event)
    if (done.success)
      terminal = (done.output.response.output ?? []).flatMap(outputItem)
  }
  const count = choices.size
  const chat = [...choices.entries()].sort(([a], [b]) => a - b).flatMap(([index, choice]): Part[] => {
    const attributes = choiceAttributes(index, count)
    const calls = [...choice.calls.entries()].sort(([a], [b]) => a - b).map(([, call]) => ({ ...call, attributes }))
    return [...assistantParts({ text: choice.text, refusal: choice.refusal }, attributes), ...calls]
  })
  if (terminal.length > 0)
    return [...chat, ...terminal]
  const responses = [...streamed.values()].filter(part => isCall(part.partType) || part.text)
  return [...chat, ...responses]
}

/**
 * Lists the parts that one request added to the conversation.
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
    return chatInput(chat.output.messages).map(finish)
  const responses = safeParse(responsesPromptSchema, body)
  return responses.success ? responsesInput(responses.output.input).map(finish) : []
}

/**
 * Lists the parts and tool calls that the model wrote in one stored completion.
 *
 * Reasoning is not an item. A stream that stops inside an event gives the items of the complete events.
 */
export function splitOutputItems(completion: RequestContent): RequestItem[] {
  if (completion.format === 'json')
    return bodyOutput(parseJson(completion.text)).map(finish)
  if (completion.format === 'sse')
    return streamOutput(completion.text.split('\n\n').map(parseJson)).map(finish)
  return []
}
