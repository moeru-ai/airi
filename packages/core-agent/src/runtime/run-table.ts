import type { Audience } from './audience'

/** Run states use the `spark:emit` vocabulary. */
export type AgentRunState = 'queued' | 'working' | 'done' | 'dropped' | 'blocked' | 'expired'

/**
 * Limits that the host gives one run. Fields exist only where code enforces them.
 * A recipe or prompt cannot widen them.
 */
export interface ExecutionEnvelope {
  /** Session whose history the run reads and writes. */
  sessionId: string
  /** External scenes of that session. */
  bindings: readonly string[]
  /** Output channels, for example `chat:owner` or `connection:<id>`. */
  outputs: readonly string[]
  /** Union of the output audiences. The run reads only records that reach all of it. */
  audience: Audience
  /** Persona that the run speaks as. */
  personaId?: string
}

/** One execution. It ends, and its session stays. */
export interface AgentRun {
  runId: string
  sessionId: string
  parentRunId?: string
  state: AgentRunState
  envelope: ExecutionEnvelope
  queuedAt: number
  startedAt?: number
  endedAt?: number
  error?: string
}

const FINAL_STATES = new Set<AgentRunState>(['done', 'dropped', 'blocked', 'expired'])

/**
 * Tracks runs from admission to their final state.
 *
 * Use when:
 * - A host needs a traceable identifier and envelope for every model execution.
 *
 * Expects:
 * - Callers move a run forward only. A final state never changes again.
 *
 * Returns:
 * - Cloned run records. Finished runs beyond the retention limit are dropped oldest first.
 */
export class RunTable {
  private readonly runs = new Map<string, AgentRun>()

  constructor(private readonly options: { finishedLimit?: number, now?: () => number, onChange?: (run: AgentRun) => void } = {}) {}

  /** Admits a run in the `queued` state. */
  admit(run: Pick<AgentRun, 'runId' | 'envelope' | 'parentRunId'>): AgentRun {
    const record: AgentRun = {
      runId: run.runId,
      sessionId: run.envelope.sessionId,
      parentRunId: run.parentRunId,
      state: 'queued',
      envelope: structuredClone(run.envelope),
      queuedAt: this.now(),
    }
    this.runs.set(record.runId, record)
    this.notify(record)
    return structuredClone(record)
  }

  /** Moves a run to a later state. Calls on a finished or unknown run do nothing. */
  transition(runId: string, state: Exclude<AgentRunState, 'queued'>, error?: string) {
    const run = this.runs.get(runId)
    if (!run || FINAL_STATES.has(run.state))
      return
    run.state = state
    if (state === 'working')
      run.startedAt = this.now()
    if (FINAL_STATES.has(state)) {
      run.endedAt = this.now()
      if (error !== undefined)
        run.error = error
      this.trimFinished()
    }
    this.notify(run)
  }

  get(runId: string): AgentRun | undefined {
    const run = this.runs.get(runId)
    return run ? structuredClone(run) : undefined
  }

  snapshot(): AgentRun[] {
    return structuredClone(Array.from(this.runs.values()))
  }

  private now() {
    return this.options.now?.() ?? Date.now()
  }

  private notify(run: AgentRun) {
    this.options.onChange?.(structuredClone(run))
  }

  private trimFinished() {
    const limit = this.options.finishedLimit ?? 100
    const finished = Array.from(this.runs.values()).filter(run => FINAL_STATES.has(run.state))
    for (const run of finished.slice(0, Math.max(0, finished.length - limit)))
      this.runs.delete(run.runId)
  }
}
