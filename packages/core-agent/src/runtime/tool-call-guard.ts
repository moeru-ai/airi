import type { Tool } from '@xsai/shared-chat'

import type { StreamEvent } from '../types/llm'

const PLAIN_TEXT_TOOL_CALL_ERROR_CODE = 'AIRI_PLAIN_TEXT_TOOL_CALL'

type BufferedOutputEvent = Extract<StreamEvent, { type: 'text-delta' | 'reasoning-delta' }>
type Emit = (event: StreamEvent) => Promise<void>

function plainTextToolCallError(toolName: string): Error {
  return Object.assign(
    new Error(`Model returned tool call "${toolName}" as plain text instead of native tool calling.`),
    { code: PLAIN_TEXT_TOOL_CALL_ERROR_CODE },
  )
}

function serializedToolCallName(parsed: unknown, toolNames: Set<string>): string | undefined {
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return undefined

  const record = parsed as Record<string, unknown>
  if (typeof record.name !== 'string' || !toolNames.has(record.name))
    return undefined
  if (!Object.hasOwn(record, 'parameters') && !Object.hasOwn(record, 'arguments'))
    return undefined

  return record.name
}

function inspectToolCallCandidates(text: string, toolNames: Set<string>, isFinal: boolean): { toolName?: string, incomplete?: boolean } | undefined {
  // Each opening brace needs its own boundary, independent of malformed prefixes.
  // Build suffix boundaries once instead of rescanning the rest of the channel
  // for every unmatched opening brace. -1 means that no closing boundary exists.
  const stringEnds = new Int32Array(text.length + 2).fill(-1)
  const objectEnds = new Int32Array(text.length + 2).fill(-1)
  for (let index = text.length - 1; index >= 0; index--) {
    const character = text[index]
    // Inside a string, a backslash consumes the next character, including a quote.
    stringEnds[index] = character === '"'
      ? index
      : stringEnds[index + (character === '\\' ? 2 : 1)]

    if (character === '}') {
      objectEnds[index] = index
    }
    else if (character === '"' || character === '{') {
      const end = character === '"' ? stringEnds[index + 1] : objectEnds[index + 1]
      // Outside strings, skip a complete string or nested object to find the
      // closing brace for the enclosing object.
      objectEnds[index] = end < 0 ? -1 : objectEnds[end + 1]
    }
    else {
      objectEnds[index] = objectEnds[index + 1]
    }
  }

  // Allow eight full-channel passes for recovery from malformed prefixes.
  // A valid object needs one pass, with no extra size or depth limit.
  let remainingParseWork = text.length * 8
  for (let start = text.indexOf('{'); start >= 0; start = text.indexOf('{', start + 1)) {
    const end = objectEnds[start + 1]
    if (end < 0) {
      // Another step can close this object. Its children then become ordinary examples.
      // Only final output permits recovery inside an unmatched outer candidate.
      if (!isFinal)
        return { incomplete: true }
      continue
    }

    // Charge overlapping spans before slicing or parsing them. On exhaustion,
    // reject the response so unchecked buffered output cannot reach consumers.
    const candidateLength = end - start + 1
    if (candidateLength > remainingParseWork)
      throw new Error('Model output exceeded the JSON inspection work limit.')
    remainingParseWork -= candidateLength

    try {
      const parsed: unknown = JSON.parse(text.slice(start, end + 1))
      const toolName = serializedToolCallName(parsed, toolNames)
      if (toolName)
        return { toolName }
      // A valid ordinary object owns its children and quoted examples.
      // Only malformed candidates permit recovery at a later opening brace.
      start = end
    }
    catch {
      continue
    }
  }
  return undefined
}

/**
 * Identify this module's sentinel for a plain-text call to a known tool.
 * Known names include tools from an earlier attempt of the same request.
 * Message text alone never matches.
 *
 * A `true` result does not make replay safe by itself. Callers must separately
 * verify that no output or tool side effects were committed and that the tool
 * choice does not require a tool before retrying without tools.
 */
export function isPlainTextToolCallError(error: unknown): boolean {
  return typeof error === 'object'
    && error !== null
    && (error as { code?: unknown }).code === PLAIN_TEXT_TOOL_CALL_ERROR_CODE
}

/**
 * Holds possible tool-call JSON until inspection proves that each output channel is safe.
 * One generation owns this state across provider changes. Text and reasoning never share candidates.
 */
export class ToolCallGuard {
  private readonly names: Set<string>
  private events: StreamEvent[] = []
  private reasoning = ''
  private text = ''
  private hasCandidate = false
  private deferUntilCompletion = false

  constructor(names?: Set<string>) {
    this.names = new Set(names)
  }

  addTools(tools?: Tool[]) {
    for (const tool of tools ?? []) {
      const name = tool.function?.name
      if (name)
        this.names.add(name)
    }
  }

  /** A transient retry discards its failed attempt but keeps output held before a provider change. */
  checkpoint() {
    return {
      events: this.events.map(event => ({ ...event })),
      reasoning: this.reasoning,
      text: this.text,
      hasCandidate: this.hasCandidate,
      deferUntilCompletion: this.deferUntilCompletion,
    }
  }

  restore(checkpoint: ReturnType<ToolCallGuard['checkpoint']>) {
    this.events = checkpoint.events
    this.reasoning = checkpoint.reasoning
    this.text = checkpoint.text
    this.hasCandidate = checkpoint.hasCandidate
    this.deferUntilCompletion = checkpoint.deferUntilCompletion
  }

  private takeOutput() {
    const events = this.events
    this.events = []
    this.reasoning = ''
    this.text = ''
    this.hasCandidate = false
    this.deferUntilCompletion = false
    return events
  }

  private async flush(emit: Emit, stopped: () => boolean) {
    for (const event of this.takeOutput()) {
      if (stopped())
        return
      if ((event.type === 'text-delta' || event.type === 'reasoning-delta') && !event.text)
        continue
      await emit(event)
    }
  }

  async inspect(isFinal: boolean, emit: Emit, stopped: () => boolean) {
    if (this.names.size === 0 || (!isFinal && this.deferUntilCompletion))
      return
    const text = inspectToolCallCandidates(this.text, this.names, isFinal)
    const reasoning = text?.toolName ? undefined : inspectToolCallCandidates(this.reasoning, this.names, isFinal)
    const name = text?.toolName ?? reasoning?.toolName
    if (name) {
      this.takeOutput()
      throw plainTextToolCallError(name)
    }
    if (text?.incomplete || reasoning?.incomplete) {
      this.deferUntilCompletion = true
      return
    }
    await this.flush(emit, stopped)
  }

  async consume(event: StreamEvent, emit: Emit, stopped: () => boolean) {
    if (event.type === 'text-delta' || event.type === 'reasoning-delta') {
      if (this.names.size === 0) {
        if (event.text)
          await emit(event)
        return
      }
      this.hasCandidate ||= event.text.includes('{')
      const previous = this.events.at(-1)
      if (previous?.type === event.type)
        (previous as BufferedOutputEvent).text += event.text
      else
        this.events.push({ ...event })
      if (event.type === 'text-delta')
        this.text += event.text
      else
        this.reasoning += event.text
      // A visible prefix blocks replay, but it does not disable detection of later JSON.
      if (!this.hasCandidate && (event.type === 'text-delta' ? this.text : this.reasoning).trim().length > 0)
        await this.flush(emit, stopped)
      return
    }
    // Keep native UI notifications behind candidates. Native activity is reported separately before this queue.
    if (event.type !== 'error' && this.names.size > 0 && this.events.length > 0) {
      this.events.push(event)
      return
    }
    await emit(event)
    if (event.type === 'error')
      throw event.error
  }
}
