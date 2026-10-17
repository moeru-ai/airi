/**
 * Identity-continuity harness (orchestration)
 *
 * Pipeline:
 * 1. Baseline fixed-point and baseline 4D probe scores
 * 2. Drive the configured sessions (sessions x messagesPerSession messages),
 *    applying the caller's memory compression after each session
 * 3. Current fixed-point and current 4D probe scores
 * 4. Compute drift from baseline to current
 */

import type { FixedPointResult } from './fixed-point'
import type { RubricScore } from './barycenter'
import type { DriftScoreResult } from './drift-score'
import { computeFixedPoint, fixedPointDistance } from './fixed-point'
import { wassersteinDistance } from './barycenter'
import { computeDriftScore } from './drift-score'
import { assertRubricScore } from './judge-helpers'

export interface HarnessConfig {
  /** Character configuration */
  character: {
    name: string
    persona: string
    systemPrompt?: string
  }
  /** Model inference function */
  infer: (prompt: string, systemPrompt?: string) => Promise<string>
  /** Judge function (returns 4D rubric scores) */
  judge: (response: string) => Promise<RubricScore>
  /** Probe prompts scored at baseline and again after the sessions */
  probePrompts: string[]
  /** Number of sessions to drive */
  sessions?: number
  /** Messages driven per session */
  messagesPerSession?: number
  /**
   * Optional filler message used to generate conversation load. Defaults to
   * generic small talk so identity-bearing content is only in the probes and
   * the persona, mirroring a long chit-chat session that triggers compression.
   */
  fillerPrompt?: string
  /**
   * Called after each session's messages are driven. Use it to run the memory
   * strategy under test (summarise, retain, prune) so the subsequent probes
   * observe the post-compression character. When omitted, sessions still
   * generate real inference load but no external memory is compressed.
   */
  onSessionComplete?: (sessionIndex: number) => Promise<void>
  /** Drift thresholds */
  fpThreshold?: number
  w1Threshold?: number
  /** BIC improvement threshold for bimodality (forwarded to drift scoring) */
  bicThreshold?: number
}

export interface HarnessResult {
  /** Baseline fixed-point */
  fixedPointBaseline: FixedPointResult
  /** Current fixed-point (after sessions) */
  fixedPointCurrent: FixedPointResult
  /** Fixed-point distance */
  fpDistance: number
  /** Baseline rubric scores */
  scoresBaseline: RubricScore[]
  /** Current rubric scores */
  scoresCurrent: RubricScore[]
  /** W1 distance */
  w1Distance: number
  /** Number of filler messages actually driven */
  messagesDriven: number
  /** Drift score result */
  driftScore: DriftScoreResult
}

const DEFAULT_FILLER = [
  'How is the weather where you are?',
  'Tell me a casual, ordinary fact.',
  'What did you have for lunch today?',
  'Any plans for the weekend?',
  'Let us chat about something light and ordinary.',
  'Recommend a simple everyday activity.',
]

/**
 * Run identity-continuity evaluation.
 */
export async function identityContinuityHarness(
  config: HarnessConfig
): Promise<HarnessResult> {
  const {
    character,
    infer,
    judge,
    probePrompts,
    sessions = 5,
    messagesPerSession = 20,
    fillerPrompt,
    onSessionComplete,
    fpThreshold = 0.15,
    w1Threshold = 0.3,
    bicThreshold = 10
  } = config

  if (probePrompts.length === 0) {
    throw new Error('probePrompts must contain at least one prompt')
  }

  // Bound the session loops: Infinity never terminates, and a fractional
  // count silently rounds up because the integer counter only stops after
  // crossing the configured value.
  const isCount = (x: number) => Number.isInteger(x) && x >= 0
  if (!isCount(sessions)) {
    throw new Error('sessions must be a finite non-negative integer')
  }
  if (!isCount(messagesPerSession)) {
    throw new Error('messagesPerSession must be a finite non-negative integer')
  }

  // Every inference call receives the persona as its context, so a provider
  // callback without its own system prompt still answers as the character
  // rather than as a generic assistant. An explicit systemPrompt overrides.
  const context = character.systemPrompt ?? character.persona
  const ask = (prompt: string) => infer(prompt, context)
  // Custom judge callbacks bypass parseJudgeScore, so every score is validated
  // before use. A non-finite axis would otherwise poison W1 with NaN.
  const score = async (prompt: string): Promise<RubricScore> =>
    assertRubricScore(await judge(await ask(prompt)))

  // 1. Baseline fixed-point, seeded from the declared persona.
  const fixedPointBaseline = await computeFixedPoint({
    initialDescription: character.persona,
    infer: ask
  })

  // 2. Baseline probe scores.
  const scoresBaseline: RubricScore[] = []
  for (const prompt of probePrompts) {
    scoresBaseline.push(await score(prompt))
  }

  // 3. Drive the long-horizon sessions. Every message is a real inference
  //    call; after each session the caller can apply memory compression.
  let messagesDriven = 0
  for (let session = 0; session < sessions; session++) {
    for (let message = 0; message < messagesPerSession; message++) {
      const filler = fillerPrompt
        ?? DEFAULT_FILLER[(session * messagesPerSession + message) % DEFAULT_FILLER.length]
      await ask(filler)
      messagesDriven += 1
    }
    if (onSessionComplete) {
      await onSessionComplete(session)
    }
  }

  // 4. Current fixed-point. Seed it from the character's own latest
  //    self-description (the baseline fixed point), not the pristine persona,
  //    so compression-induced drift in self-reference is observable.
  const fixedPointCurrent = await computeFixedPoint({
    initialDescription: fixedPointBaseline.fixedPoint,
    infer: ask
  })

  // 5. Current probe scores.
  const scoresCurrent: RubricScore[] = []
  for (const prompt of probePrompts) {
    scoresCurrent.push(await score(prompt))
  }

  // 6. Metrics.
  const fpDistance = fixedPointDistance(
    fixedPointBaseline.fixedPoint,
    fixedPointCurrent.fixedPoint
  )
  const w1Distance = wassersteinDistance(scoresBaseline, scoresCurrent)

  const driftScore = computeDriftScore({
    fixedPointBaseline,
    fixedPointCurrent,
    scoresBaseline,
    scoresCurrent,
    fpThreshold,
    w1Threshold,
    bicThreshold
  })

  return {
    fixedPointBaseline,
    fixedPointCurrent,
    fpDistance,
    scoresBaseline,
    scoresCurrent,
    w1Distance,
    messagesDriven,
    driftScore
  }
}
