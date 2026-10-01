/** Where a stimulus comes from. An internal proposal gets no extra authority from its origin. */
export type StimulusOrigin = 'external' | 'internal'

/**
 * One observation or proposal offered to intake. Receiving it does not create a run.
 */
export interface Stimulus {
  id: string
  /** Opaque work kind that the source declares. Intake never parses its meaning. */
  kind: string
  origin: StimulusOrigin
  /** Module name, `owner` for local input, or `scheduler` for internal proposals. */
  source: string
  /** Protocol event that carried it, for example `input:text` or `spark:notify`. */
  event: string
  eventId?: string
  bindings: readonly string[]
  /** Prior salience from 0 to 1. Sources set it, and intake only maps their vocabulary. */
  salience: number
  /** Owner input on a local surface. It bypasses synchronous triage. */
  direct?: boolean
  receivedAt: number
  deadlineAt?: number
  /** Stimuli with the same key replace each other while they wait. */
  coalesceKey?: string
  parentRunId?: string
  /** Number of internal proposals before this one in its chain. */
  depth?: number
}

/** What intake chose. `rejected` is an inability, never a choice: audience, capacity, or authority. */
export type IntakeOutcome = 'admitted' | 'deferred' | 'merged' | 'ignored' | 'rejected'

/** Which method decided. `fallback` means a classifier was late, unavailable, or not confident. */
export type IntakeDecider = 'rule' | 'classifier' | 'fallback'

/** One intake decision. Ignored and rejected stimuli have no run. */
export interface IntakeRecord {
  stimulusId: string
  kind: string
  origin: StimulusOrigin
  source: string
  event: string
  eventId?: string
  receivedAt: number
  decidedAt: number
  outcome: IntakeOutcome
  reason: string
  decidedBy: IntakeDecider
  salience: number
  runId?: string
  /** For `deferred`: when the stimulus returns to attention. */
  retryAt?: number
  /** For `merged`: the waiting stimulus that replaced it. */
  mergedInto?: string
  parentRunId?: string
  depth?: number
}

/** A policy result. The host turns it into a record. */
export interface IntakeDecision {
  outcome: Exclude<IntakeOutcome, 'rejected'>
  reason: string
  decidedBy: IntakeDecider
  /** Final salience after appraisal. @default the stimulus prior */
  salience?: number
  retryAt?: number
  mergedInto?: string
}

const URGENCY_SALIENCE: Record<string, number> = {
  critical: 0.9,
  immediate: 0.9,
  high: 0.7,
  soon: 0.7,
  normal: 0.5,
  low: 0.3,
  later: 0.3,
}

/**
 * Maps the urgency or priority words that sources use to a prior salience.
 *
 * Returns:
 * - 0.9, 0.7, 0.5, or 0.3. An absent or unknown word is `normal`.
 */
export function salienceFromUrgency(urgency?: string): number {
  return (urgency && URGENCY_SALIENCE[urgency]) || URGENCY_SALIENCE.normal
}

/**
 * Bounded record of intake decisions, apart from the run table.
 *
 * Use when:
 * - A host needs to tell an ignored stimulus from a lost one, or a choice from a failure.
 *
 * Expects:
 * - One record per decision. A deferred stimulus that returns gets a new record with the same stimulus id.
 *
 * Returns:
 * - Cloned records, oldest first. Records beyond the limit are dropped oldest first.
 */
export class IntakeLog {
  private readonly records: IntakeRecord[] = []

  constructor(private readonly options: { limit?: number, now?: () => number, onRecord?: (record: IntakeRecord) => void } = {}) {}

  /** Records one decision for a stimulus. */
  record(stimulus: Stimulus, decision: Omit<IntakeDecision, 'outcome'> & { outcome: IntakeOutcome, runId?: string }): IntakeRecord {
    const record: IntakeRecord = {
      stimulusId: stimulus.id,
      kind: stimulus.kind,
      origin: stimulus.origin,
      source: stimulus.source,
      event: stimulus.event,
      eventId: stimulus.eventId,
      receivedAt: stimulus.receivedAt,
      decidedAt: this.options.now?.() ?? Date.now(),
      outcome: decision.outcome,
      reason: decision.reason,
      decidedBy: decision.decidedBy,
      salience: decision.salience ?? stimulus.salience,
      runId: decision.runId,
      retryAt: decision.retryAt,
      mergedInto: decision.mergedInto,
      parentRunId: stimulus.parentRunId,
      depth: stimulus.depth,
    }
    this.records.push(record)
    const limit = this.options.limit ?? 200
    if (this.records.length > limit)
      this.records.splice(0, this.records.length - limit)
    try {
      this.options.onRecord?.(structuredClone(record))
    }
    catch (error) {
      console.error('Intake observer failed:', error)
    }
    return structuredClone(record)
  }

  /** Returns every retained decision for one stimulus, oldest first. */
  forStimulus(stimulusId: string): IntakeRecord[] {
    return structuredClone(this.records.filter(record => record.stimulusId === stimulusId))
  }

  snapshot(): IntakeRecord[] {
    return structuredClone(this.records)
  }
}
