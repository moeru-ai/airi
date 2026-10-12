import type { RequestContent } from './request-content'

import { array, literal, looseObject, number, optional, picklist, safeParse, string, unknown } from 'valibot'

const chatChunkSchema = looseObject({
  choices: array(looseObject({
    index: optional(number()),
    delta: optional(looseObject({ tool_calls: optional(array(looseObject({ index: optional(number()) }))) })),
  })),
})
const chatBodySchema = looseObject({
  choices: array(looseObject({ message: optional(looseObject({ tool_calls: optional(array(unknown())) })) })),
})
const outputItemsSchema = array(looseObject({ type: optional(string()) }))
const responsesBodySchema = looseObject({
  output: optional(outputItemsSchema),
  response: optional(looseObject({ output: optional(outputItemsSchema) })),
})
const functionCallItemEventSchema = looseObject({
  type: picklist(['response.output_item.added', 'response.output_item.done']),
  item: looseObject({ type: literal('function_call'), id: optional(string()), call_id: optional(string()) }),
})
const argumentsDeltaEventSchema = looseObject({
  type: literal('response.function_call_arguments.delta'),
  item_id: string(),
})

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text)
  }
  catch {
    return undefined
  }
}

function countBodyCalls(body: unknown) {
  const chat = safeParse(chatBodySchema, body)
  if (chat.success) {
    return chat.output.choices
      .flatMap(choice => choice.message?.tool_calls ?? [])
      .filter(call => safeParse(looseObject({}), call).success)
      .length
  }
  const responses = safeParse(responsesBodySchema, body)
  if (!responses.success)
    return 0
  const output = responses.output.response?.output ?? responses.output.output ?? []
  return output.filter(item => item.type === 'function_call').length
}

function countStreamCalls(events: unknown[]) {
  // A Chat Completions call arrives as deltas that share one index inside one choice.
  // Each choice numbers its calls from 0, so the key holds both indexes. A missing index means 0.
  const chatCalls = new Set<string>()
  // A Responses call arrives as item events and argument deltas. The item ID maps to the call ID once the item is known.
  const responseCalls = new Set<string>()
  const callByItem = new Map<string, string>()
  for (const event of events) {
    const chunk = safeParse(chatChunkSchema, event)
    if (chunk.success) {
      for (const choice of chunk.output.choices) {
        for (const piece of choice.delta?.tool_calls ?? [])
          chatCalls.add(`${choice.index ?? 0}:${piece.index ?? 0}`)
      }
      continue
    }
    const itemEvent = safeParse(functionCallItemEventSchema, event)
    if (itemEvent.success) {
      const { id, call_id: callId } = itemEvent.output.item
      const call = callId ?? id ?? ''
      if (id)
        callByItem.set(id, call)
      responseCalls.add(call)
      continue
    }
    const delta = safeParse(argumentsDeltaEventSchema, event)
    if (delta.success)
      responseCalls.add(callByItem.get(delta.output.item_id) ?? delta.output.item_id)
  }
  return chatCalls.size + responseCalls.size
}

/**
 * Counts the tool calls that the model requested in one stored completion.
 *
 * The admin trace list sorts and filters by this number, so the request log stores it beside the content.
 * The admin dashboard applies the same rules to one trace when it shows the tool steps.
 *
 * Returns `undefined` when the content is a text preview, because a truncated body cannot be read as JSON.
 * A stream that stops inside an event counts the complete events.
 */
export function countToolCalls(completion: RequestContent): number | undefined {
  if (completion.format === 'json')
    return countBodyCalls(parseJson(completion.text))
  if (completion.format === 'sse')
    return countStreamCalls(completion.text.split('\n\n').map(parseJson))
  return undefined
}
