import type { Eventa, EventContext } from '@moeru/eventa'

import type { Emission, InputRevisions, RevisionMetadata, RuleContext, VoiceCommand, VoiceRule } from './types'

import { matchBy } from '@moeru/eventa'
import { createQueue } from '@proj-airi/stream-kit'

import { errorFromCause } from '../../utils/error'
import { inputBegunEvent, inputSettledEvent, inputTranscriptEvent } from './events'

export interface VoicePolicyOptions {
  /** Runs one command on the device. It can emit new events, which the engine queues. */
  execute: (command: VoiceCommand) => void
  /** The conversation context revision of a session. It becomes the `context` entry of input revisions. */
  contextRevision?: (sessionId: string) => number
  onError?: (error: Error) => void
}

interface InputRecord {
  readonly sessionId: string
  readonly counts: Record<string, number>
  // The last content of each counted kind, compared with `Object.is`.
  readonly contents: Map<string, unknown>
}

interface RuleEntry {
  readonly rule: VoiceRule<unknown>
  state: unknown
}

/** The in-process eventa context of a voice controller, as `createContext()` returns it. A host can link it to a transport context. */
export type VoiceEventContext = EventContext<undefined, { raw?: unknown }>

/** Every voice event id starts with this prefix. The engine reads only these events from a shared context. */
const VOICE_EVENT_PREFIX = 'proj-airi:voice:'

/**
 * Narrows an event that a rule receives to one definition.
 *
 * @example
 * if (isEvent(event, pausedSignal))
 *   event.body.text // string
 */
export function isEvent<P>(event: Eventa<unknown>, eventa: Eventa<P>): event is Eventa<P> & { body: P } {
  return event.id === eventa.id
}

/** Builds one emission of a rule step. */
export function emission<P>(eventa: Eventa<P>, body: P): Emission {
  return { eventa: eventa as Eventa<unknown>, body }
}

function inputIdOf(event: Eventa<unknown>): string | undefined {
  const body = event.body as { inputId?: unknown } | undefined
  return typeof body?.inputId === 'string' ? body.inputId : undefined
}

/**
 * Runs voice rules over the voice events of one eventa context.
 *
 * A transport does not promise event order, so the engine imposes it. Events wait in one queue in arrival order.
 * An event that a rule emits, or that a command causes, joins the end of the queue. Every rule therefore sees every
 * event in one order. Each event first updates input revisions, then reaches the rules in registration order.
 *
 * Commands for one input follow first-wins: after one `seal` or `cancel`, later ones for that input are dropped.
 */
export class VoicePolicy {
  private readonly rules: RuleEntry[] = []
  private readonly inputs = new Map<string, InputRecord>()
  private readonly decided = new Set<string>()
  private readonly queue = createQueue<Eventa<unknown>>({ handlers: [async ({ data }) => this.process(data)] })
  private readonly stop: () => void
  private readonly context: RuleContext = {
    revisions: inputId => this.revisions(inputId),
    isCurrent: (inputId, readAt) => this.isCurrent(inputId, readAt),
  }

  constructor(readonly events: VoiceEventContext, private readonly options: VoicePolicyOptions) {
    // NOTICE:
    // A function matcher selects voice events. `matchBy(RegExp)` never matches in @moeru/eventa 1.0.2:
    // `typeof regExp` is 'object', so matchBy takes its object branch, finds no `ids`, `eventa`, or `types`, and keeps
    // a matcher that returns false. Source: node_modules/@moeru/eventa/dist/context-*.mjs, function matchBy.
    // Remove this note when eventa checks RegExp before plain objects.
    this.stop = events.on(matchBy<unknown>(event => event.id.startsWith(VOICE_EVENT_PREFIX)), event => this.queue.enqueue(event))
  }

  /** Adds a rule. The returned function removes it. */
  addRule<S>(rule: VoiceRule<S>): () => void {
    const entry: RuleEntry = { rule: rule as VoiceRule<unknown>, state: rule.initial() }
    this.rules.push(entry)
    return () => {
      const index = this.rules.indexOf(entry)
      if (index >= 0)
        this.rules.splice(index, 1)
    }
  }

  revisions(inputId: string): InputRevisions {
    const input = this.inputs.get(inputId)
    if (!input)
      return {}
    return { ...input.counts, context: this.options.contextRevision?.(input.sessionId) ?? 0 }
  }

  isCurrent(inputId: string, readAt: InputRevisions | undefined): boolean {
    if (!this.inputs.has(inputId))
      return false
    const current = this.revisions(inputId)
    return Object.entries(readAt ?? {}).every(([kind, count]) => (current[kind] ?? 0) === count)
  }

  close() {
    this.stop()
    this.rules.length = 0
    this.queue.clear()
  }

  private process(event: Eventa<unknown>) {
    this.count(event)

    for (const entry of this.rules) {
      try {
        const step = entry.rule.reduce(entry.state, event, this.context)
        entry.state = step.state
        for (const item of step.emit ?? [])
          void this.events.emit(item.eventa, item.body)
        for (const command of step.commands ?? [])
          this.run(command)
      }
      catch (cause) {
        // A failed rule keeps its previous state. Other rules still receive the event.
        this.options.onError?.(errorFromCause(cause, `Voice rule ${entry.rule.name} failed`))
      }
    }

    if (isEvent(event, inputSettledEvent)) {
      this.inputs.delete(event.body.inputId)
      this.decided.delete(event.body.inputId)
    }
  }

  /** Updates input revisions before rules see the event, so a rule reads revisions that include it. */
  private count(event: Eventa<unknown>) {
    if (isEvent(event, inputBegunEvent)) {
      this.inputs.set(event.body.inputId, { sessionId: event.body.sessionId, counts: {}, contents: new Map() })
      return
    }
    if (isEvent(event, inputTranscriptEvent)) {
      this.change(event.body.inputId, 'transcriptText', event.body.text)
      return
    }

    const revision = (event.metadata as RevisionMetadata<unknown> | undefined)?.revision
    const inputId = inputIdOf(event)
    if (typeof revision === 'function' && inputId)
      this.change(inputId, event.id, revision(event.body))
  }

  private change(inputId: string, kind: string, content: unknown) {
    const input = this.inputs.get(inputId)
    if (!input || (input.contents.has(kind) && Object.is(input.contents.get(kind), content)))
      return
    input.contents.set(kind, content)
    input.counts[kind] = (input.counts[kind] ?? 0) + 1
  }

  private run(command: VoiceCommand) {
    if (command.type === 'seal' || command.type === 'cancel') {
      if (this.decided.has(command.inputId))
        return
      this.decided.add(command.inputId)
    }
    this.options.execute(command)
  }
}
