import type { Conversation, GenerationRound, Turn } from './types'

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
  hardLimitBytes: number
  retainRounds: number
  onEvent?: (event: { type: 'started' | 'applied' | 'failed' | 'discarded' | 'blocked', rounds: number, bytes: number }) => void
}

/** One resolved request supplies both its byte measurement and its isolated background summarizer. */
export interface CompactRequest {
  scope: string
  measureContextBytes: (value: Conversation) => number
  summarize: (snapshot: Conversation, signal: AbortSignal) => Promise<string>
}

function units(conversation: Conversation): Turn[] {
  return conversation.turns.flatMap<Turn>(turn => turn.type === 'assistant'
    ? turn.rounds.map(round => ({ ...turn, rounds: [round] }))
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
  return !round.projectionIssues.length
    && round.toolInvocations.every(call => call.execution.status === 'succeeded')
    && (round.content.some(part => part.type !== 'tool' && (!('text' in part) || part.text.trim().length > 0))
      || round.toolInvocations.some(call => call.execution.status === 'succeeded' && call.execution.output.some(part => part.type === 'image')))
}

/** One session owns this disposable request cache. Stored history and Host execution state never enter its ownership. */
export class ConversationCompact {
  private scope?: string
  private committed?: Checkpoint
  private job?: SummaryJob
  private failure?: { prefix: string[], error: unknown }

  constructor(private readonly options: CompactOptions) {
    if (!Number.isSafeInteger(options.softLimitBytes) || !Number.isSafeInteger(options.hardLimitBytes)
      || options.softLimitBytes <= 0 || options.hardLimitBytes <= options.softLimitBytes
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
    // The summary uses no tools. Reserving space for its instructions also gates that provider request.
    if (measure(snapshot) + 2048 >= this.options.hardLimitBytes) {
      this.failure = { prefix: prefixKey, error: new Error('Summary input exceeds the context byte budget') }
      return
    }
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

  private apply(source: Turn[], measure: (value: Conversation) => number) {
    const job = this.job
    if (!job || !job.ready)
      return
    const next = this.project(source, job.checkpoint)
    const bytes = measure(next)
    if (bytes >= measure(this.project(source))) {
      this.failure = { prefix: job.checkpoint.prefix, error: new Error('Conversation summary does not reduce the request context') }
      this.options.onEvent?.({ type: 'failed', rounds: job.checkpoint.rounds.size, bytes })
    }
    else {
      this.committed = job.checkpoint
      this.failure = undefined
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

  /** Starts background work below the hard budget. At the hard budget, waits or rejects before the next provider dispatch. */
  async prepare(conversation: Conversation, target: CompactRequest, signal?: AbortSignal): Promise<Conversation> {
    signal?.throwIfAborted()
    const source = units(structuredClone(conversation))
    const measure = target.measureContextBytes
    if (this.scope !== target.scope || (this.committed && !matches(this.committed.prefix, source))) {
      this.reset()
      this.scope = target.scope
    }
    if (this.job && (this.job.signal.aborted || !matches(this.job.checkpoint.prefix, source))) {
      this.options.onEvent?.({ type: 'discarded', rounds: this.job.checkpoint.rounds.size, bytes: measure(this.project(source)) })
      this.job.controller.abort(new Error('Conversation prefix changed'))
      this.job = undefined
    }
    this.apply(source, measure)
    if (this.job?.error) {
      this.failure = { prefix: this.job.checkpoint.prefix, error: this.job.error }
      this.options.onEvent?.({ type: 'failed', rounds: this.job.checkpoint.rounds.size, bytes: measure(this.project(source)) })
      this.job = undefined
    }
    let projected = this.project(source)
    if (measure(projected) >= this.options.softLimitBytes && !this.job)
      this.start(source, target, signal)
    if (measure(projected) < this.options.hardLimitBytes)
      return projected
    const job = this.job
    if (job) {
      await this.wait(job, signal)
      if (this.job !== job || this.scope !== target.scope)
        throw new Error('Conversation changed while waiting for its summary')
      if (job.error)
        this.failure = { prefix: job.checkpoint.prefix, error: job.error }
      this.apply(source, measure)
      projected = this.project(source)
    }
    if (measure(projected) >= this.options.hardLimitBytes) {
      this.options.onEvent?.({ type: 'blocked', rounds: this.committed?.rounds.size ?? 0, bytes: measure(projected) })
      throw new Error('Conversation context exceeds the request byte budget', { cause: this.failure?.error })
    }
    signal?.throwIfAborted()
    return projected
  }
}
