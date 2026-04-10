/**
 * Coding Operational Memory Taxonomy v1
 *
 * A thin classification layer over the existing verification gate/nudge/diagnosis
 * signals.  Seeds are derived AFTER a gate decision and stored in
 * `CodingRunState.operationalMemorySeeds` so the next workflow invocation can
 * apply lightweight bias without re-deriving everything from scratch.
 *
 * Design constraints:
 * - Pure functions only — no runtime, no side effects
 * - Only in-session memory (no cross-session persistence)
 * - Seeds drive bias hints, NOT direct action execution
 *
 * REVIEW: Future cross-session memory (v2) design anchor
 *
 * When cross-session persistence is needed, consider a four-body
 * classification (inspired by Claude Code's memoryTypes taxonomy):
 *
 *   1. user      — user role, preferences, knowledge level
 *   2. feedback  — corrections AND confirmations (both negative and positive signals)
 *   3. project   — ongoing work, goals, deadlines, constraints (convert
 *                  relative dates to absolute: "Thursday" → "2026-03-05")
 *   4. reference — pointers to external systems (Linear, Grafana, Slack)
 *
 * Key principles if implementing:
 * - Never store what git/grep can derive (code patterns, file paths, architecture)
 * - Even if user explicitly asks to store a code pattern, ask "what's non-obvious?"
 * - On recall, verify against current state before acting — memories can go stale
 * - "The memory says X exists" ≠ "X exists now" — grep/read before recommending
 *
 * Current scope: operational memory only (verification outcomes, diagnosis
 * results, gate decisions). Cross-session = deferred until product need arises.
 */

import type {
  CodingChangeRootCauseType,
  CodingRunState,
  CodingVerificationMemorySeed,
} from '../state'
import type {
  CodingVerificationGateReasonCode,
} from './verification-gate'

// ---------------------------------------------------------------------------
// Taxonomy types
// ---------------------------------------------------------------------------

/**
 * High-level classification of what kind of lesson this seed encodes.
 *
 * - `verification_failure` — validation ran but outcome was failed/needs_follow_up
 * - `diagnosis_failure`    — diagnosis concluded amend/abort is required
 * - `completion_block`     — gate blocked due to missing review, pending planner work
 * - `validation_strategy`  — pass scenario: which command/scope worked
 * - `targeting_hint`       — wrong_target / missed_dependency: next run needs different search
 */
export type CodingOperationalMemoryKind
  = | 'verification_failure'
    | 'diagnosis_failure'
    | 'completion_block'
    | 'validation_strategy'
    | 'targeting_hint'

/**
 * Fine-grained reason code, mapping to gate reasonCode or diagnosis rootCauseType.
 * `gate_passed` is a positive signal: verification completed without issues.
 */
export type CodingOperationalMemoryReason
  = | 'wrong_target'
    | 'missed_dependency'
    | 'validation_command_mismatch'
    | 'baseline_noise'
    | 'unresolved_issues_remain'
    | 'patch_verification_mismatch'
    | 'verification_bad_faith'
    | 'no_validation_run'
    | 'review_missing'
    | 'pending_planner_work'
    | 'amend_required'
    | 'abort_required'
    | 'gate_passed'

/**
 * A single operational memory seed.
 * Seeds are replaced wholesale each gate cycle (no historical accumulation).
 */
export interface CodingOperationalMemorySeed {
  kind: CodingOperationalMemoryKind
  reason: CodingOperationalMemoryReason
  /** Short free-text readable by the next workflow handler. ≤ 200 chars. */
  summary: string
  /** File that was under review when this seed was created, if known. */
  reviewedFile?: string
  /** Validation command suggested for the next cycle, if known. */
  suggestedValidationCommand?: string
  /** Which signal provided this seed. */
  source: 'review' | 'diagnosis' | 'verification_nudge' | 'verification_gate'
  /** ISO timestamp. */
  recordedAt: string
  /** Whether a bounded recheck could clear this issue (false = hard block). */
  recheckEligible: boolean
  /** Whether this seed represents a primary blocking issue. */
  blocking: boolean
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Source weight used to break ties in primary seed selection. */
const SOURCE_WEIGHT: Record<CodingOperationalMemorySeed['source'], number> = {
  verification_gate: 4,
  diagnosis: 3,
  review: 2,
  verification_nudge: 1,
}

/** Maps gate reasonCode → taxonomy kind + reason + recheckEligible + blocking. */
const GATE_REASON_MAP: Partial<Record<
  CodingVerificationGateReasonCode,
  {
    kind: CodingOperationalMemoryKind
    reason: CodingOperationalMemoryReason
    recheckEligible: boolean
    blocking: boolean
  }
>> = {
  gate_pass: {
    kind: 'validation_strategy',
    // NOTICE: 'gate_passed' is a positive outcome marker — deliberately distinct
    // from 'baseline_noise' (which is a diagnosis term for pre-existing failures).
    reason: 'gate_passed',
    recheckEligible: false,
    blocking: false,
  },
  no_validation_run: {
    kind: 'verification_failure',
    reason: 'no_validation_run',
    recheckEligible: true,
    blocking: true,
  },
  validation_command_mismatch: {
    kind: 'verification_failure',
    reason: 'validation_command_mismatch',
    recheckEligible: true,
    blocking: true,
  },
  verification_bad_faith: {
    kind: 'verification_failure',
    reason: 'verification_bad_faith',
    recheckEligible: false,
    blocking: true,
  },
  patch_verification_mismatch: {
    kind: 'verification_failure',
    reason: 'patch_verification_mismatch',
    recheckEligible: false,
    blocking: true,
  },
  unresolved_issues_remain: {
    kind: 'verification_failure',
    reason: 'unresolved_issues_remain',
    recheckEligible: false,
    blocking: true,
  },
  review_missing: {
    kind: 'completion_block',
    reason: 'review_missing',
    recheckEligible: true,
    blocking: true,
  },
  review_blocked: {
    kind: 'completion_block',
    reason: 'review_missing',
    recheckEligible: false,
    blocking: true,
  },
  review_failed: {
    kind: 'completion_block',
    reason: 'review_missing',
    recheckEligible: false,
    blocking: true,
  },
  review_needs_follow_up: {
    kind: 'verification_failure',
    reason: 'unresolved_issues_remain',
    recheckEligible: true,
    blocking: true,
  },
  pending_planner_work: {
    kind: 'completion_block',
    reason: 'pending_planner_work',
    recheckEligible: false,
    blocking: true,
  },
  amend_required: {
    kind: 'diagnosis_failure',
    reason: 'amend_required',
    recheckEligible: false,
    blocking: true,
  },
  abort_required: {
    kind: 'diagnosis_failure',
    reason: 'abort_required',
    recheckEligible: false,
    blocking: true,
  },
}

/** Maps diagnosis rootCauseType → taxonomy kind + reason. */
const DIAGNOSIS_ROOT_CAUSE_MAP: Partial<Record<
  CodingChangeRootCauseType,
  { kind: CodingOperationalMemoryKind, reason: CodingOperationalMemoryReason }
>> = {
  wrong_target: { kind: 'targeting_hint', reason: 'wrong_target' },
  missed_dependency: { kind: 'targeting_hint', reason: 'missed_dependency' },
  validation_command_mismatch: { kind: 'verification_failure', reason: 'validation_command_mismatch' },
  baseline_noise: { kind: 'verification_failure', reason: 'baseline_noise' },
  test_only_breakage: { kind: 'verification_failure', reason: 'unresolved_issues_remain' },
  validation_environment_issue: { kind: 'verification_failure', reason: 'validation_command_mismatch' },
  incomplete_change: { kind: 'completion_block', reason: 'unresolved_issues_remain' },
  unknown: { kind: 'verification_failure', reason: 'unresolved_issues_remain' },
}

function buildSummary(params: {
  kind: CodingOperationalMemoryKind
  reason: CodingOperationalMemoryReason
  source: CodingOperationalMemorySeed['source']
  blocking: boolean
  recheckEligible: boolean
  extra?: string
}): string {
  const recheckNote = params.recheckEligible ? 'recheck-eligible' : 'hard-block'
  const blockNote = params.blocking ? 'blocking' : 'advisory'
  const base = `[${params.kind}:${params.reason}] source=${params.source} ${blockNote} ${recheckNote}`
  const full = params.extra ? `${base} — ${params.extra}` : base
  // Enforce ≤ 200 chars
  return full.length > 200 ? `${full.slice(0, 197)}...` : full
}

/**
 * Extract seeds from a `CodingVerificationMemorySeed` (nudge or outcome).
 * Only generates seeds for non-pass outcomes.
 */
function seedsFromVerificationMemory(
  mem: CodingVerificationMemorySeed,
  source: 'verification_nudge' | 'verification_gate',
  now: string,
): CodingOperationalMemorySeed[] {
  const seeds: CodingOperationalMemorySeed[] = []
  for (const reasonCode of mem.reasonCodes) {
    const mapping = GATE_REASON_MAP[reasonCode as CodingVerificationGateReasonCode]
    if (!mapping || (!mapping.blocking && source !== 'verification_gate')) {
      continue
    }

    // Skip pass seeds from nudge source (those come from gate pass path)
    if (reasonCode === 'gate_pass' && source === 'verification_nudge') {
      continue
    }

    seeds.push({
      kind: mapping.kind,
      reason: mapping.reason,
      summary: buildSummary({
        kind: mapping.kind,
        reason: mapping.reason,
        source,
        blocking: mapping.blocking,
        recheckEligible: mapping.recheckEligible,
        extra: mem.suggestedValidationCommand
          ? `suggested: ${mem.suggestedValidationCommand}`
          : undefined,
      }),
      reviewedFile: mem.reviewedFile,
      suggestedValidationCommand: mem.suggestedValidationCommand,
      source,
      recordedAt: now,
      recheckEligible: mapping.recheckEligible,
      blocking: mapping.blocking,
    })
  }

  return seeds
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Derive the current set of operational memory seeds from coding state.
 * Consumes existing `lastVerificationOutcome`, `lastChangeDiagnosis`, and
 * `lastChangeReview` — does NOT modify state.
 *
 * Seeds are intended to replace (not append to) the previous set each cycle.
 */
export function deriveCodingOperationalMemorySeeds(
  codingState: CodingRunState,
): CodingOperationalMemorySeed[] {
  const now = new Date().toISOString()
  const seeds: CodingOperationalMemorySeed[] = []
  const seen = new Set<string>()

  function addIfNew(seed: CodingOperationalMemorySeed) {
    const key = `${seed.kind}:${seed.reason}:${seed.source}`
    if (!seen.has(key)) {
      seen.add(key)
      seeds.push(seed)
    }
  }

  // 1. Gate outcome (highest authority)
  const outcome = codingState.lastVerificationOutcome
  if (outcome && outcome.outcome !== 'nudged') {
    if (outcome.outcome === 'passed') {
      // Pass → 1 validation_strategy seed (non-blocking)
      const mapping = GATE_REASON_MAP.gate_pass!
      addIfNew({
        kind: mapping.kind,
        reason: mapping.reason,
        summary: buildSummary({
          kind: mapping.kind,
          reason: mapping.reason,
          source: 'verification_gate',
          blocking: false,
          recheckEligible: false,
          extra: outcome.suggestedValidationCommand
            ? `proven command: ${outcome.suggestedValidationCommand}`
            : undefined,
        }),
        reviewedFile: outcome.reviewedFile,
        suggestedValidationCommand: outcome.suggestedValidationCommand,
        source: 'verification_gate',
        recordedAt: now,
        recheckEligible: false,
        blocking: false,
      })
    }
    else {
      // recheck_required / failed → extract blocking seeds
      for (const seed of seedsFromVerificationMemory(outcome, 'verification_gate', now)) {
        addIfNew(seed)
      }
    }
  }

  // 2. Diagnosis (provides targeting_hint / diagnosis_failure)
  const diagnosis = codingState.lastChangeDiagnosis
  if (diagnosis) {
    const diagMapping = DIAGNOSIS_ROOT_CAUSE_MAP[diagnosis.rootCauseType]
    if (diagMapping) {
      const isBlocking = diagnosis.nextAction === 'amend' || diagnosis.nextAction === 'abort'
      const recheckEligible = !isBlocking && diagnosis.rootCauseType !== 'wrong_target'
      addIfNew({
        kind: diagMapping.kind,
        reason: diagMapping.reason,
        summary: buildSummary({
          kind: diagMapping.kind,
          reason: diagMapping.reason,
          source: 'diagnosis',
          blocking: isBlocking,
          recheckEligible,
          extra: `nextAction=${diagnosis.nextAction} confidence=${String(Math.round(diagnosis.confidence * 100))}%`,
        }),
        reviewedFile: codingState.lastTargetSelection?.selectedFile,
        source: 'diagnosis',
        recordedAt: now,
        recheckEligible,
        blocking: isBlocking,
      })
    }

    // If diagnosis forces abort/amend, also add an explicit abort/amend seed
    if (diagnosis.nextAction === 'abort') {
      addIfNew({
        kind: 'diagnosis_failure',
        reason: 'abort_required',
        summary: buildSummary({
          kind: 'diagnosis_failure',
          reason: 'abort_required',
          source: 'diagnosis',
          blocking: true,
          recheckEligible: false,
        }),
        source: 'diagnosis',
        recordedAt: now,
        recheckEligible: false,
        blocking: true,
      })
    }
    else if (diagnosis.nextAction === 'amend') {
      addIfNew({
        kind: 'diagnosis_failure',
        reason: 'amend_required',
        summary: buildSummary({
          kind: 'diagnosis_failure',
          reason: 'amend_required',
          source: 'diagnosis',
          blocking: true,
          recheckEligible: false,
        }),
        source: 'diagnosis',
        recordedAt: now,
        recheckEligible: false,
        blocking: true,
      })
    }
  }

  // 3. Review signals (supplemental, non-blocking unless outcome already covered it)
  const review = codingState.lastChangeReview
  if (review && review.status !== 'ready_for_next_file' && !seen.has('verification_failure:unresolved_issues_remain:verification_gate')) {
    if ((review.unresolvedIssues?.length ?? 0) > 0) {
      addIfNew({
        kind: 'verification_failure',
        reason: 'unresolved_issues_remain',
        summary: buildSummary({
          kind: 'verification_failure',
          reason: 'unresolved_issues_remain',
          source: 'review',
          blocking: true,
          recheckEligible: false,
          extra: `issues=${review.unresolvedIssues.length}`,
        }),
        reviewedFile: review.filesReviewed?.[0],
        suggestedValidationCommand: codingState.lastScopedValidationCommand?.command,
        source: 'review',
        recordedAt: now,
        recheckEligible: false,
        blocking: true,
      })
    }
  }

  return seeds
}

/**
 * Pick the primary seed to use for bias decisions.
 * Priority: blocking first, then by source weight (gate > diagnosis > review > nudge).
 */
export function pickPrimaryOperationalMemory(
  seeds: CodingOperationalMemorySeed[],
): CodingOperationalMemorySeed | undefined {
  if (seeds.length === 0) {
    return undefined
  }

  const blockingSeeds = seeds.filter(s => s.blocking)
  const candidates = blockingSeeds.length > 0 ? blockingSeeds : seeds

  return candidates.reduce((best, current) => {
    const bestWeight = SOURCE_WEIGHT[best.source]
    const currentWeight = SOURCE_WEIGHT[current.source]
    if (currentWeight > bestWeight) {
      return current
    }

    return best
  })
}

/**
 * Produce a short summary string (≤ 200 chars) suitable for embedding in
 * structured state for the next workflow handler to read.
 */
export function summarizeOperationalMemory(
  seeds: CodingOperationalMemorySeed[],
): string {
  if (seeds.length === 0) {
    return 'no operational memory seeds'
  }

  const primary = pickPrimaryOperationalMemory(seeds)
  if (!primary) {
    return 'no primary operational memory seed'
  }

  const blockingCount = seeds.filter(s => s.blocking).length
  const extra = blockingCount > 1 ? ` (+${blockingCount - 1} more blocking)` : ''
  const text = `primary: ${primary.reason} [${primary.kind}] recheckEligible=${String(primary.recheckEligible)}${extra}`
  return text.length > 200 ? `${text.slice(0, 197)}...` : text
}
