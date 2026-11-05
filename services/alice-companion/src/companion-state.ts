import type {
  AuditEntry,
  CompanionEvent,
  CompanionMode,
  CompanionState,
  Consent,
  MoodState,
  RelationshipMetrics,
} from './contracts'

import { merge } from '@moeru/std'
import { resolveMood } from '@proj-airi/alice-motion'

import { metricNames } from './contracts'

/**
 * Rules that the reducer applies. The service builds one policy at startup.
 */
export interface CompanionPolicy {
  /** IANA time zone for local calendar dates. Streaks and "days together" count local dates, not 24 hour blocks. */
  timeZone: string
  energy: {
    /** `disabled` freezes the energy value. It also stops when the NeoAlice mood system reports energy. */
    mode: 'simulation' | 'disabled'
    costPerInteraction: number
    recoveryPerHour: number
  }
  proposal: {
    /** Largest change one proposal can make to each metric, in the metric's own scale. */
    maxDeltaPerProposal: RelationshipMetrics
    /** Largest absolute change per metric in one local day, summed over all proposals. */
    maxDailyChange: RelationshipMetrics
  }
  /** Sizes of the bounded ID lists in the persisted state. */
  limits: {
    processedEventIds: number
    recentInteractionIds: number
    usedProposalSources: number
  }
}

/**
 * Default rules. The values are starting points to calibrate, not measured values.
 * Repeated chat alone never changes a metric: only validated proposals do, and the
 * daily cap stops a flood of proposals.
 */
export const defaultPolicy: CompanionPolicy = {
  timeZone: 'America/Sao_Paulo',
  energy: { mode: 'simulation', costPerInteraction: 2, recoveryPerHour: 10 },
  proposal: {
    maxDeltaPerProposal: { affection: 20, trust: 2, intimacy: 2, comfort: 2, respect: 2 },
    maxDailyChange: { affection: 60, trust: 6, intimacy: 6, comfort: 6, respect: 6 },
  },
  limits: { processedEventIds: 2000, recentInteractionIds: 200, usedProposalSources: 2000 },
}

export interface ReduceResult {
  state: CompanionState
  /** `duplicate` means the event ID was already handled. The state is the same object and nothing is audited. */
  outcome: 'applied' | 'unchanged' | 'rejected' | 'duplicate'
  audit?: AuditEntry
  /** `true` when a mood or energy field changed. The service then publishes `companion.affect.updated`. */
  affectChanged: boolean
}

/** Published state. Derived values (effective energy, days together) are computed for `generatedAt`. */
export interface CompanionSnapshot {
  schemaVersion: 1
  personaId: string
  revision: number
  updatedAt: string
  generatedAt: string
  mode: CompanionMode
  consent: Consent
  mood: MoodState | null
  energy: { value: number, source: CompanionState['energy']['source'] }
  metrics: RelationshipMetrics
  /** All metrics on a 0..100 scale for display. `affection` is divided by 10. */
  metricsPercent: RelationshipMetrics
  time: CompanionState['time'] & { daysTogether: number, timeZone: string }
}

/** Payload of `companion.affect.updated`. The Motion Director reads it. It never writes back. */
export interface AffectUpdated {
  schemaVersion: 1
  eventType: 'companion.affect.updated'
  eventId: string
  personaId: string
  emotion: string | null
  talkingheadMood: string
  airiEmotion: string
  intensity: number | null
  energy: number
  relationshipMode: CompanionMode
  sourceEventId: string | null
}

type Decision = { outcome: 'applied', reason?: string } | { outcome: 'rejected', reason: string }

const MS_PER_HOUR = 3_600_000
const MS_PER_DAY = 86_400_000

/** State fields that only support idempotency or bookkeeping. A change in them does not make a new revision. */
const bookkeepingPaths = new Set([
  'revision',
  'updatedAt',
  'processedEventIds',
  'recentInteractionIds',
  'usedProposalSources',
  'dailyMetricChange',
  'energy.updatedAt',
])

function zeroMetrics(): RelationshipMetrics {
  return { affection: 0, trust: 0, intimacy: 0, comfort: 0, respect: 0 }
}

function initialTime(): CompanionState['time'] {
  return { firstMetAt: null, lastInteractionAt: null, totalInteractions: 0, currentStreak: 0, bestStreak: 0, lastStreakLocalDate: null }
}

export function createInitialState(options: { personaId: string, ownerProfileId: string, at: Date }): CompanionState {
  const at = options.at.toISOString()
  return {
    schemaVersion: 1,
    personaId: options.personaId,
    ownerProfileId: options.ownerProfileId,
    revision: 0,
    updatedAt: at,
    mode: 'companion',
    consent: {
      relationshipTracking: true,
      romanticProgression: false,
      proactiveSpeech: false,
      screenObservation: false,
      photoRetention: false,
      timeDecay: false,
    },
    mood: null,
    energy: { value: 100, source: 'local_policy', updatedAt: at },
    metrics: zeroMetrics(),
    dailyMetricChange: { localDate: null, totals: zeroMetrics() },
    time: initialTime(),
    processedEventIds: [],
    recentInteractionIds: [],
    usedProposalSources: [],
  }
}

/**
 * Applies one validated event to the state. Pure: the input state is never mutated.
 *
 * A rejected event keeps every field except the processed ID list, so a retry with
 * the same event ID stays rejected and is not applied later by accident.
 */
export function reduceCompanionState(state: CompanionState, event: CompanionEvent, policy: CompanionPolicy): ReduceResult {
  if (state.processedEventIds.includes(event.eventId))
    return { state, outcome: 'duplicate', affectChanged: false }

  const at = event.at.toISOString()
  const draft = structuredClone(state)
  const decision = applyEvent(draft, event, policy)
  const next = decision.outcome === 'applied' ? draft : structuredClone(state)
  next.processedEventIds = pushBounded(next.processedEventIds, event.eventId, policy.limits.processedEventIds)

  const changes = decision.outcome === 'applied' ? diffState(state, next) : []
  let outcome: ReduceResult['outcome'] = decision.outcome
  if (decision.outcome === 'applied' && changes.length === 0)
    outcome = 'unchanged'
  if (outcome === 'applied') {
    next.revision = state.revision + 1
    next.updatedAt = at
  }

  return {
    state: next,
    outcome,
    affectChanged: changes.some(change => change.path.startsWith('mood') || change.path.startsWith('energy')),
    audit: {
      at,
      revision: next.revision,
      eventId: event.eventId,
      kind: event.kind,
      outcome,
      reason: decision.reason,
      changes,
    },
  }
}

function applyEvent(draft: CompanionState, event: CompanionEvent, policy: CompanionPolicy): Decision {
  switch (event.kind) {
    case 'mood':
      return applyMood(draft, event)
    case 'interaction':
      return applyInteraction(draft, event, policy)
    case 'proposal':
      return applyProposal(draft, event, policy)
    case 'settings':
      return applySettings(draft, event)
    case 'reset':
      return applyReset(draft, event)
  }
}

/**
 * The NeoAlice mood system is the authority for mood. This copies its value and
 * never estimates a missing intensity or cause.
 */
function applyMood(draft: CompanionState, event: Extract<CompanionEvent, { kind: 'mood' }>): Decision {
  const resolved = resolveMood(event.mood)
  if (!resolved.primary)
    return { outcome: 'rejected', reason: 'empty_mood' }

  const intensity = event.intensity ?? null
  const current = draft.mood
  const sameMood = current !== null
    && current.primary === resolved.primary
    && current.intensity === intensity
    && current.causes.join('\n') === event.causes.join('\n')

  // An identical mood can arrive again, for example on both mood topics.
  // Keeping the old record keeps the revision and the audit log stable.
  if (!sameMood) {
    draft.mood = {
      ...resolved,
      intensity,
      causes: event.causes,
      sourceSite: event.site,
      sourceEventId: event.eventId,
      updatedAt: event.at.toISOString(),
    }
  }

  if (event.energy !== undefined)
    draft.energy = { value: event.energy, source: 'existing_ia', updatedAt: event.at.toISOString() }

  return { outcome: 'applied' }
}

function applyInteraction(draft: CompanionState, event: Extract<CompanionEvent, { kind: 'interaction' }>, policy: CompanionPolicy): Decision {
  if (event.interrupted)
    return { outcome: 'rejected', reason: 'interrupted_turn' }

  const at = event.at.toISOString()
  settleEnergy(draft, event.at, policy)

  const time = draft.time
  time.totalInteractions += 1
  time.firstMetAt ??= at
  // A clock that moved backwards must not move the last interaction backwards.
  if (time.lastInteractionAt === null || event.at.getTime() > Date.parse(time.lastInteractionAt))
    time.lastInteractionAt = at
  advanceStreak(time, localDateOf(event.at, policy.timeZone))

  if (usesEnergySimulation(draft, policy))
    draft.energy.value = clamp(round2(draft.energy.value - policy.energy.costPerInteraction), 0, 100)

  draft.recentInteractionIds = pushBounded(draft.recentInteractionIds, event.eventId, policy.limits.recentInteractionIds)
  return { outcome: 'applied', reason: event.origin === 'derived' ? 'derived_from_speech_traffic' : undefined }
}

/**
 * A proposal is a suggestion with evidence. It must point to a counted interaction,
 * each interaction can back only one proposal, and the per-proposal and daily caps clamp it.
 */
function applyProposal(draft: CompanionState, event: Extract<CompanionEvent, { kind: 'proposal' }>, policy: CompanionPolicy): Decision {
  if (!draft.consent.relationshipTracking)
    return { outcome: 'rejected', reason: 'relationship_tracking_disabled' }
  if (!draft.recentInteractionIds.includes(event.sourceEventId))
    return { outcome: 'rejected', reason: 'unknown_source_interaction' }
  if (draft.usedProposalSources.includes(event.sourceEventId))
    return { outcome: 'rejected', reason: 'source_already_used' }

  draft.usedProposalSources = pushBounded(draft.usedProposalSources, event.sourceEventId, policy.limits.usedProposalSources)

  const today = localDateOf(event.at, policy.timeZone)
  if (draft.dailyMetricChange.localDate !== today)
    draft.dailyMetricChange = { localDate: today, totals: zeroMetrics() }

  for (const name of metricNames) {
    const requested = event.deltas[name]
    if (requested === undefined || requested === 0)
      continue

    const perProposal = policy.proposal.maxDeltaPerProposal[name]
    const clamped = clamp(requested, -perProposal, perProposal)
    const remainingToday = Math.max(0, policy.proposal.maxDailyChange[name] - draft.dailyMetricChange.totals[name])
    const step = Math.sign(clamped) * Math.min(Math.abs(clamped), remainingToday)
    const upperBound = name === 'affection' ? 1000 : 100

    const before = draft.metrics[name]
    draft.metrics[name] = clamp(round2(before + step), 0, upperBound)
    // The daily total counts the change that really happened, after the 0..max clamp.
    draft.dailyMetricChange.totals[name] = round2(draft.dailyMetricChange.totals[name] + Math.abs(draft.metrics[name] - before))
  }

  return { outcome: 'applied', reason: event.reason }
}

function applySettings(draft: CompanionState, event: Extract<CompanionEvent, { kind: 'settings' }>): Decision {
  const consent = merge(draft.consent, event.consent)
  const mode = event.mode ?? draft.mode

  if (mode === 'dating_sim' && !consent.romanticProgression)
    return { outcome: 'rejected', reason: 'romantic_progression_consent_required' }
  if (mode !== 'companion' && !consent.relationshipTracking)
    return { outcome: 'rejected', reason: 'relationship_tracking_consent_required' }

  draft.consent = consent
  draft.mode = mode
  return { outcome: 'applied' }
}

/** A reset keeps mode and consent. They are user settings, not simulation state. */
function applyReset(draft: CompanionState, event: Extract<CompanionEvent, { kind: 'reset' }>): Decision {
  const all = event.scope === 'all'
  if (all || event.scope === 'relationship') {
    draft.metrics = zeroMetrics()
    draft.dailyMetricChange = { localDate: null, totals: zeroMetrics() }
    draft.usedProposalSources = []
  }
  if (all || event.scope === 'time') {
    draft.time = initialTime()
    draft.recentInteractionIds = []
  }
  if (all || event.scope === 'mood')
    draft.mood = null
  if (all || event.scope === 'energy')
    draft.energy = { value: 100, source: 'local_policy', updatedAt: event.at.toISOString() }

  return { outcome: 'applied', reason: `reset_${event.scope}` }
}

/** Builds the published state for `now`. It does not change the stored state. */
export function describeState(state: CompanionState, now: Date, policy: CompanionPolicy): CompanionSnapshot {
  const today = dayNumber(localDateOf(now, policy.timeZone))
  const time = state.time

  let daysTogether = 0
  if (time.firstMetAt !== null) {
    // The first local date counts as day 1. `max` keeps day 1 when the clock is behind.
    daysTogether = Math.max(1, today - dayNumber(localDateOf(new Date(time.firstMetAt), policy.timeZone)) + 1)
  }

  // A streak whose last date is before yesterday is over. Show 0 without changing the stored best streak.
  let currentStreak = time.currentStreak
  if (time.lastStreakLocalDate === null || today - dayNumber(time.lastStreakLocalDate) > 1)
    currentStreak = 0

  return {
    schemaVersion: 1,
    personaId: state.personaId,
    revision: state.revision,
    updatedAt: state.updatedAt,
    generatedAt: now.toISOString(),
    mode: state.mode,
    consent: state.consent,
    mood: state.mood,
    energy: { value: effectiveEnergy(state, now, policy), source: state.energy.source },
    metrics: state.metrics,
    metricsPercent: {
      affection: round2(state.metrics.affection / 10),
      trust: state.metrics.trust,
      intimacy: state.metrics.intimacy,
      comfort: state.metrics.comfort,
      respect: state.metrics.respect,
    },
    time: { ...time, currentStreak, daysTogether, timeZone: policy.timeZone },
  }
}

export function describeAffect(snapshot: CompanionSnapshot): AffectUpdated {
  return {
    schemaVersion: 1,
    eventType: 'companion.affect.updated',
    eventId: `affect-${snapshot.personaId}-${snapshot.revision}`,
    personaId: snapshot.personaId,
    emotion: snapshot.mood?.primary ?? null,
    talkingheadMood: snapshot.mood?.talkingheadMood ?? 'neutral',
    airiEmotion: snapshot.mood?.airiEmotion ?? 'neutral',
    intensity: snapshot.mood?.intensity ?? null,
    energy: snapshot.energy.value,
    relationshipMode: snapshot.mode,
    sourceEventId: snapshot.mood?.sourceEventId ?? null,
  }
}

function usesEnergySimulation(state: CompanionState, policy: CompanionPolicy): boolean {
  return policy.energy.mode === 'simulation' && state.energy.source === 'local_policy'
}

function effectiveEnergy(state: CompanionState, now: Date, policy: CompanionPolicy): number {
  if (!usesEnergySimulation(state, policy))
    return state.energy.value
  const elapsedHours = (now.getTime() - Date.parse(state.energy.updatedAt)) / MS_PER_HOUR
  if (elapsedHours <= 0)
    return state.energy.value
  return clamp(round2(state.energy.value + elapsedHours * policy.energy.recoveryPerHour), 0, 100)
}

/** Stores the recovered energy up to `at`. A clock behind `updatedAt` changes nothing. */
function settleEnergy(draft: CompanionState, at: Date, policy: CompanionPolicy): void {
  if (!usesEnergySimulation(draft, policy) || at.getTime() <= Date.parse(draft.energy.updatedAt))
    return
  draft.energy.value = effectiveEnergy(draft, at, policy)
  draft.energy.updatedAt = at.toISOString()
}

/**
 * Same local date or an earlier one (clock moved back) keeps the streak.
 * The next date extends it. A gap starts a new streak of 1.
 */
function advanceStreak(time: CompanionState['time'], localDate: string): void {
  if (time.lastStreakLocalDate === null) {
    time.currentStreak = 1
  }
  else {
    const gap = dayNumber(localDate) - dayNumber(time.lastStreakLocalDate)
    if (gap <= 0)
      return
    time.currentStreak = gap === 1 ? time.currentStreak + 1 : 1
  }
  time.lastStreakLocalDate = localDate
  time.bestStreak = Math.max(time.bestStreak, time.currentStreak)
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>()

/**
 * Returns the calendar date of an instant in a time zone, as `YYYY-MM-DD`.
 *
 * @example
 * localDateOf(new Date('2026-11-04T02:30:00Z'), 'America/Sao_Paulo')
 * // => '2026-11-03'
 */
export function localDateOf(at: Date, timeZone: string): string {
  let formatter = dateFormatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    dateFormatters.set(timeZone, formatter)
  }
  const parts = Object.fromEntries(formatter.formatToParts(at).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day}`
}

/** Days since 1970-01-01 for a `YYYY-MM-DD` date. Used only to subtract local dates. */
function dayNumber(localDate: string): number {
  const [year, month, day] = localDate.split('-').map(Number)
  return Date.UTC(year, month - 1, day) / MS_PER_DAY
}

/** Lists consumer-visible fields that differ. Bookkeeping fields are skipped. */
function diffState(before: CompanionState, after: CompanionState): AuditEntry['changes'] {
  const changes: AuditEntry['changes'] = []
  const beforeFields = flatten(before)
  const afterFields = flatten(after)
  for (const path of new Set([...beforeFields.keys(), ...afterFields.keys()])) {
    const from = beforeFields.get(path)
    const to = afterFields.get(path)
    if (JSON.stringify(from) !== JSON.stringify(to))
      changes.push({ path, from, to })
  }
  return changes
}

function flatten(value: unknown, prefix = '', out = new Map<string, unknown>()): Map<string, unknown> {
  if (bookkeepingPaths.has(prefix))
    return out
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    for (const [key, child] of Object.entries(value))
      flatten(child, prefix ? `${prefix}.${key}` : key, out)
    return out
  }
  out.set(prefix, value)
  return out
}

function pushBounded(list: string[], item: string, limit: number): string[] {
  const next = [...list, item]
  return next.length > limit ? next.slice(next.length - limit) : next
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}
