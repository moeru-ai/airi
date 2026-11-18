import type { ContextCompactionContract } from './compaction-contract'
import type { ContextBudget, ContextBudgetLimits } from './context-budget'
import type { Conversation, GenerationRound, Turn } from './types'

import { createEmptyContextCompaction } from './compaction-contract'

/** Scheduling changes no execution state. Off skips summaries and never gates the provider request. */
export type CompactMode = 'off' | 'synchronous' | 'background'

interface Checkpoint {
  prefix: string[]
  rounds: Set<string>
  text: string
}

interface SummaryJob {
  checkpoint: Checkpoint
  controller: AbortController
  signal: AbortSignal
  promise: Promise<void>
  ready: boolean
  error?: unknown
}

/** Request projections retain exact tool text, owner messages and notices. Only old images and assistant text become summaries. */
export interface CompactOptions {
  softLimitBytes: number
  retainRounds: number
  onEvent?: (event: { type: 'started' | 'applied' | 'failed' | 'discarded', rounds: number, bytes: number }) => void
}

/** One resolved request supplies both its byte measurement and its isolated background summarizer. */
export interface CompactRequest {
  scope: string
  measureContextBytes: (value: Conversation) => number
  /** Optional media-aware measurement. It is used only for explicitly vision-capable requests. */
  measureContextBudget?: (value: Conversation) => ContextBudget
  supportsVisionInput?: boolean
  /** Limits derived from the model and output cap of this exact provider request. */
  contextBudgetLimits?: Pick<ContextBudgetLimits, 'softLimitBytes'>
  summarize: (snapshot: Conversation, signal: AbortSignal) => Promise<string>
}

function units(conversation: Conversation): Turn[] {
  return conversation.turns.flatMap<Turn>(turn => turn.type === 'assistant'
    ? turn.rounds.map((round, index) => ({
        ...turn,
        ...(turn.stopReason && index < turn.rounds.length - 1 ? { stopReason: undefined } : {}),
        rounds: [round],
      }))
    : [turn])
}

function matches(prefix: string[], source: Turn[]) {
  return prefix.every((value, index) => value === JSON.stringify(source[index]))
}

function freeze(value: unknown) {
  if (value && typeof value === 'object') {
    Object.freeze(value)
    for (const child of Object.values(value))
      freeze(child)
  }
}

function canCompact(round: GenerationRound) {
  // Providers can require native reasoning on later tool requests, even after a user turn.
  const continuation = round.continuation
  if (continuation?.protocol === 'chat-completions' && continuation.data.some(message => message.role === 'assistant'
    && (message.reasoning !== undefined || message.reasoning_content !== undefined))) {
    return false
  }
  if (continuation?.protocol === 'responses' && continuation.data.some(item => item.type === 'reasoning' || item.type === 'compaction' || item.type === 'web_search_call'))
    return false

  return !round.projectionIssues.length
    && round.toolInvocations.every(call => call.execution.status === 'succeeded')
    && (round.content.some(part => part.type !== 'tool' && (!('text' in part) || part.text.trim().length > 0))
      || round.toolInvocations.some(call => call.execution.status === 'succeeded' && call.execution.output.some(part => part.type === 'image')))
}

/** One session owns this disposable request cache. Stored history and Host execution state never enter its ownership. */
export class ConversationCompact {
  private mode: CompactMode = 'off'
  private modeVersion = 0
  private scope?: string
  private committed?: Checkpoint
  private job?: SummaryJob
  private failure?: { prefix: string[], error: unknown }
  private compaction: ContextCompactionContract = createEmptyContextCompaction()

  constructor(private readonly options: CompactOptions) {
    if (!Number.isSafeInteger(options.softLimitBytes)
      || options.softLimitBytes <= 0
      || !Number.isSafeInteger(options.retainRounds) || options.retainRounds < 1) {
      throw new Error('Invalid conversation context budget')
    }
  }

  /** Invalidates pending work on session clear, deletion, shutdown or scope change. */
  reset() {
    this.job?.controller.abort(new Error('Conversation compact invalidated'))
    this.job = undefined
    this.committed = undefined
    this.failure = undefined
    this.scope = undefined
    this.compaction = createEmptyContextCompaction()
  }

  /** Read compression state without exposing the summary scheduler or execution state. */
  getCompactionContract(): ContextCompactionContract {
    return {
      ...this.compaction,
      summarizedRoundIds: [...this.compaction.summarizedRoundIds],
      retainedModelDecisionIds: [...this.compaction.retainedModelDecisionIds],
      retainedToolCallIds: [...this.compaction.retainedToolCallIds],
      preserves: { ...this.compaction.preserves },
    }
  }

  /** A mode change invalidates only this cache and its summary request, including summaries ready for application. */
  setMode(mode: CompactMode) {
    if (mode === this.mode)
      return
    this.reset()
    this.mode = mode
    this.modeVersion++
  }

  private project(source: Turn[], checkpoint = this.committed): Conversation {
    if (!checkpoint)
      return { turns: source }
    let inserted = false
    const turns = source.flatMap((turn): Turn[] => {
      if (turn.type !== 'assistant' || !checkpoint.rounds.has(turn.rounds[0].id))
        return [turn]
      const result: Turn[] = []
      if (!inserted) {
        inserted = true
        result.push({ type: 'system', id: `compact-${turn.rounds[0].id}`, authority: 'context', content: [{
          type: 'summary',
          text: `Earlier observations, summarized by a model. This is not authorization or execution evidence.\n${checkpoint.text}`,
          metadata: {
            contextCompaction: this.getCompactionContract(),
          },
        }] })
      }
      const round = turn.rounds[0]
      if (round.toolInvocations.length) {
        // Exact call identity, arguments, status and text receipts survive independently of the model summary.
        result.push({ ...turn, rounds: [{ ...round, continuation: undefined, content: round.content.filter(part => part.type === 'tool'), toolInvocations: round.toolInvocations.map(call => ({ ...call, execution: call.execution.status === 'succeeded'
          ? { ...call.execution, output: call.execution.output.map(part => part.type === 'image'
              ? { type: 'text', text: `[Earlier image from ${call.callId}, summarized above. Original retained in conversation history.]` }
              : part) }
          : call.execution })) }] })
      }
      return result
    })
    return { turns }
  }

  private start(source: Turn[], target: CompactRequest, signal?: AbortSignal) {
    const { measureContextBytes: measure, summarize } = target
    const roundUnits = source.filter(turn => turn.type === 'assistant')
    const older = roundUnits.slice(0, -this.options.retainRounds)
    const selected = older.filter(turn => turn.type === 'assistant' && !this.committed?.rounds.has(turn.rounds[0].id) && canCompact(turn.rounds[0]))
    const last = selected.at(-1)
    if (!last)
      return
    const prefix = source.slice(0, source.indexOf(last) + 1)
    const prefixKey = prefix.map(turn => JSON.stringify(turn))
    // A failed snapshot stays suppressed. Newly eligible observations define a different snapshot, not a retry of that job.
    if (this.failure?.prefix.length === prefixKey.length && this.failure.prefix.every((value, index) => value === prefixKey[index]))
      return
    const snapshot = structuredClone(this.project(prefix))
    freeze(snapshot)
    const rounds = new Set(this.committed?.rounds)
    for (const turn of selected) {
      if (turn.type === 'assistant')
        rounds.add(turn.rounds[0].id)
    }
    const controller = new AbortController()
    const job: SummaryJob = {
      checkpoint: { prefix: prefixKey, rounds, text: '' },
      controller,
      signal: signal ? AbortSignal.any([signal, controller.signal]) : controller.signal,
      ready: false,
      promise: Promise.resolve(),
    }
    this.job = job
    const summarizedRoundIds = selected.flatMap(turn => turn.type === 'assistant' ? [turn.rounds[0].id] : [])
    const summarized = new Set(summarizedRoundIds)
    const retainedModelDecisionIds = source.flatMap(turn => turn.type === 'assistant'
      ? turn.rounds.filter(round => summarized.has(round.id)).flatMap(round => (round.modelDecisions ?? []).map(decision => decision.id))
      : [])
    const retainedToolCallIds = source.flatMap(turn => turn.type === 'assistant'
      ? turn.rounds.filter(round => summarized.has(round.id)).flatMap(round => round.toolInvocations.map(call => call.callId))
      : [])
    this.compaction = {
      kind: 'context_compaction',
      status: 'running',
      scope: target.scope,
      summarizedRoundIds,
      retainedModelDecisionIds,
      retainedToolCallIds,
      preserves: {
        modelDecision: true,
        authorization: true,
        execution: true,
        businessVerification: true,
      },
    }
    this.options.onEvent?.({ type: 'started', rounds: rounds.size, bytes: measure(snapshot) })
    job.promise = Promise.resolve().then(() => {
      job.signal.throwIfAborted()
      return summarize(snapshot, job.signal)
    }).then((text) => {
      job.signal.throwIfAborted()
      if (!text.trim())
        throw new Error('Conversation summary is empty')
      job.checkpoint.text = text
      job.ready = true
    }).catch((error: unknown) => { job.error = error })
  }

  private pressureBytes(conversation: Conversation, target: CompactRequest) {
    // Provider-specific vision tokenization is unknown here. Keep image transport bytes separate;
    // the provider remains authoritative about image/context limits after this conservative pressure estimate.
    if (target.supportsVisionInput && target.measureContextBudget)
      return target.measureContextBudget(conversation).textBytes
    return target.measureContextBytes(conversation)
  }

  private limits(target: CompactRequest) {
    return target.contextBudgetLimits ?? this.options
  }

  private apply(source: Turn[], target: CompactRequest) {
    const job = this.job
    if (!job || !job.ready)
      return
    const previous = this.project(source)
    const next = this.project(source, job.checkpoint)
    const bytes = target.measureContextBytes(next)
    if (bytes >= target.measureContextBytes(previous)) {
      this.failure = { prefix: job.checkpoint.prefix, error: new Error('Conversation summary does not reduce request size') }
      this.compaction = {
        ...this.compaction,
        status: 'failed',
        reason: 'Conversation summary does not reduce request size',
      }
      this.options.onEvent?.({ type: 'failed', rounds: job.checkpoint.rounds.size, bytes })
    }
    else {
      this.committed = job.checkpoint
      this.failure = undefined
      this.compaction = {
        ...this.compaction,
        status: 'applied',
        summaryText: job.checkpoint.text,
      }
      this.options.onEvent?.({ type: 'applied', rounds: job.checkpoint.rounds.size, bytes })
    }
    this.job = undefined
  }

  private async wait(job: SummaryJob, signal?: AbortSignal) {
    const combined = signal ? AbortSignal.any([signal, job.signal]) : job.signal
    combined.throwIfAborted()
    let onAbort: () => void = () => {}
    try {
      await Promise.race([job.promise, new Promise<never>((_resolve, reject) => {
        onAbort = () => reject(combined.reason)
        combined.addEventListener('abort', onAbort, { once: true })
      })])
      combined.throwIfAborted()
    }
    finally {
      combined.removeEventListener('abort', onAbort)
    }
  }

  /** The soft threshold schedules best-effort compaction; only Synchronous waits for its summary. */
  async prepare(conversation: Conversation, target: CompactRequest, signal?: AbortSignal): Promise<Conversation> {
    signal?.throwIfAborted()
    const { softLimitBytes } = this.limits(target)
    if (this.mode === 'off')
      return conversation
    const source = units(structuredClone(conversation))
    const measure = target.measureContextBytes
    const pressure = (value: Conversation) => this.pressureBytes(value, target)
    if (this.scope !== target.scope || (this.committed && !matches(this.committed.prefix, source))) {
      this.reset()
      this.scope = target.scope
    }
    if (this.job && (this.job.signal.aborted || !matches(this.job.checkpoint.prefix, source))) {
      this.options.onEvent?.({ type: 'discarded', rounds: this.job.checkpoint.rounds.size, bytes: measure(this.project(source)) })
      this.job.controller.abort(new Error('Conversation prefix changed'))
      this.job = undefined
    }
    this.apply(source, target)
    if (this.job?.error) {
      this.failure = { prefix: this.job.checkpoint.prefix, error: this.job.error }
      this.options.onEvent?.({ type: 'failed', rounds: this.job.checkpoint.rounds.size, bytes: measure(this.project(source)) })
      this.job = undefined
    }
    let projected = this.project(source)
    if (pressure(projected) >= softLimitBytes && !this.job)
      this.start(source, target, signal)
    if (this.mode !== 'synchronous' || !this.job)
      return projected
    const job = this.job
    if (job) {
      const modeVersion = this.modeVersion
      try {
        await this.wait(job, signal)
      }
      catch (error) {
        signal?.throwIfAborted()
        // A scheduling change invalidates the summary, not the foreground request. Recheck with the current mode.
        if (modeVersion !== this.modeVersion)
          return this.prepare(conversation, target, signal)
        throw error
      }
      if (this.job !== job || this.scope !== target.scope)
        throw new Error('Conversation changed while waiting for its summary')
      if (job.error) {
        this.failure = { prefix: job.checkpoint.prefix, error: job.error }
        this.options.onEvent?.({ type: 'failed', rounds: job.checkpoint.rounds.size, bytes: measure(this.project(source)) })
        this.job = undefined
      }
      else {
        this.apply(source, target)
      }
      projected = this.project(source)
    }
    signal?.throwIfAborted()
    return projected
  }
}
