import type { ChatSlices, ChatSlicesToolCall, ChatSlicesToolCallResult } from '../../../../types/chat'

/** One generic tool call inside a group, with the slice index that the result lookup and the rerun action use. */
export interface ToolCallGroupItem {
  sliceIndex: number
  toolCall: ChatSlicesToolCall['toolCall']
  /**
   * The call in its reply: its id and its occurrence in the whole reply, because a provider can repeat an id across
   * rounds. Result slices land between calls while a reply streams, so the slice index is no key.
   */
  key: string
}

/**
 * What the assistant bubble renders, in slice order.
 *
 * - `slice`: one slice that renders by itself, such as text, a sticker, or a call that has its own renderer.
 * - `tool-group`: consecutive generic tool calls that share one folded line.
 */
export type ChatSliceEntry
  = | { kind: 'slice', sliceIndex: number, slice: Exclude<ChatSlices, ChatSlicesToolCallResult> }
    | { kind: 'tool-group', key: string, items: ToolCallGroupItem[] }

/**
 * Groups consecutive generic tool calls, so one reply shows each run of calls as one line.
 *
 * Use when:
 * - The assistant bubble renders its slices, during streaming and from history alike.
 *
 * Expects:
 * - `hasOwnRenderer` names the calls that render by themselves, such as journal or recipe calls. They split a run.
 *
 * Returns:
 * - Entries in slice order. Result slices join the run that they follow, because they render nothing by themselves.
 *   Text and stickers split runs, so a call never moves away from the text around it.
 */
export function groupToolCallSlices(slices: readonly ChatSlices[], hasOwnRenderer: (toolName: string) => boolean): ChatSliceEntry[] {
  const entries: ChatSliceEntry[] = []
  const occurrences = new Map<string, number>()
  let group: Extract<ChatSliceEntry, { kind: 'tool-group' }> | undefined

  for (const [sliceIndex, slice] of slices.entries()) {
    if (slice.type === 'tool-call-result')
      continue

    if (slice.type === 'tool-call') {
      const occurrence = occurrences.get(slice.toolCall.toolCallId) ?? 0
      occurrences.set(slice.toolCall.toolCallId, occurrence + 1)

      if (!hasOwnRenderer(slice.toolCall.toolName)) {
        if (!group) {
          // A provider can repeat a call id across rounds. The occurrence in the whole reply keeps sibling groups apart.
          group = { kind: 'tool-group', key: `${slice.toolCall.toolCallId}#${occurrence}`, items: [] }
          entries.push(group)
        }
        group.items.push({ sliceIndex, toolCall: slice.toolCall, key: `${slice.toolCall.toolCallId}#${occurrence}` })
        continue
      }
    }

    group = undefined
    entries.push({ kind: 'slice', sliceIndex, slice })
  }

  return entries
}

/**
 * Turns a raw tool name into a readable label. It applies the same rule to every tool, so no tool needs a label of its own.
 *
 * @example
 * toolDisplayName('builtIn_emitSparkCommand')
 * // => 'Emit spark command'
 *
 * @example
 * toolDisplayName('home_assistant_call_service')
 * // => 'Home assistant call service'
 */
export function toolDisplayName(toolName: string) {
  const words = toolName
    .replace(/^builtIn_/, '')
    .replace(/([a-z\d])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .trim()
    .toLowerCase()
  // A name of only separators has no words, so the raw name stays.
  if (!words)
    return toolName
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** A call state, as `resolveToolCallBlockState` reads it from the result. */
export type ToolCallState = 'executing' | 'done' | 'error'

/**
 * What the folded line of a group says.
 *
 * - `running`: at least one call has no result yet. `current` is the newest running call.
 * - `settled`: every call has a result. `failed` counts the calls whose result is an error.
 */
export type ToolCallGroupSummary
  = | { phase: 'running', count: number, current: number }
    | { phase: 'settled', count: number, failed: number }

/** Summarizes the states of a group's calls, in call order. */
export function summarizeToolCallGroup(states: readonly ToolCallState[]): ToolCallGroupSummary {
  const current = states.findLastIndex(state => state === 'executing')
  if (current >= 0)
    return { phase: 'running', count: states.length, current }
  return { phase: 'settled', count: states.length, failed: states.filter(state => state === 'error').length }
}

/** The JSON type of a plain value. The view marks it, so the number `0` and the string `"0"` read differently. */
export type PayloadValueType = 'string' | 'number' | 'boolean' | 'null'

/**
 * A tool payload as the chat shows it. Keys and values stay exactly as the tool sent them.
 *
 * - `text`: a plain value, or a payload that is not JSON.
 * - `object`: fields in their sent order. Each value is another node.
 * - `array`: items in their sent order.
 */
export type PayloadNode
  = | {
    kind: 'text'
    text: string
    /** Missing for a payload that is not JSON. That text shows as the tool sent it, without quotes. */
    type?: PayloadValueType
  }
  | { kind: 'object', entries: { key: string, value: PayloadNode }[] }
  | { kind: 'array', items: PayloadNode[] }

function valueTypeOf(value: unknown): PayloadValueType {
  if (typeof value === 'string')
    return 'string'
  if (typeof value === 'number' || typeof value === 'bigint')
    return 'number'
  if (typeof value === 'boolean')
    return 'boolean'
  // `null`, and a value that JSON cannot write such as `undefined`, shows as a bare word.
  return 'null'
}

function toNode(value: unknown): PayloadNode {
  if (Array.isArray(value))
    return { kind: 'array', items: value.map(toNode) }
  if (value !== null && typeof value === 'object')
    return { kind: 'object', entries: Object.entries(value).map(([key, entry]) => ({ key, value: toNode(entry) })) }
  return { kind: 'text', text: typeof value === 'string' ? value : String(value), type: valueTypeOf(value) }
}

/**
 * Turns tool arguments or a tool result into fields and values, the same way for every tool.
 *
 * @example
 * formatToolPayload('{"city":"Bangkok","days":1}')
 * // => { kind: 'object', entries: [{ key: 'city', value: { kind: 'text', text: 'Bangkok', type: 'string' } }, { key: 'days', value: { kind: 'text', text: '1', type: 'number' } }] }
 *
 * @example
 * formatToolPayload('Tool call error: timeout')
 * // => { kind: 'text', text: 'Tool call error: timeout' }
 */
export function formatToolPayload(payload: unknown): PayloadNode | undefined {
  if (payload == null || payload === '')
    return undefined

  if (typeof payload !== 'string')
    return toNode(payload)

  try {
    return toNode(JSON.parse(payload))
  }
  catch {
    // A string that is not JSON is already what the tool sent, so it shows as plain text.
    return { kind: 'text', text: payload }
  }
}

/**
 * Reads a tool payload as the data that it holds.
 *
 * A string that holds JSON becomes that data. Any other value stays as the tool sent it.
 *
 * @example
 * parseToolPayload('{"city":"Bangkok"}')
 * // => { city: 'Bangkok' }
 *
 * @example
 * parseToolPayload('Tool call error: timeout')
 * // => 'Tool call error: timeout'
 */
export function parseToolPayload(payload: unknown): unknown {
  if (typeof payload !== 'string')
    return payload

  try {
    return JSON.parse(payload)
  }
  catch {
    return payload
  }
}
