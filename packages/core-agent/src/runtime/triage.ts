import type { Classifier, ClassifierRequest } from './classifier'
import type { IntakeAppraisal, IntakeDecision, Stimulus } from './intake'

import { askWithin, CLASSIFIER_TRUST_THRESHOLD, noulConfidence } from './classifier'

/** Scene sources stay below the 0.85 interruption level, whatever a classifier says. */
export const SCENE_SALIENCE_CAP = 0.8

/** Below this probability of attention, a confident answer ignores the stimulus. */
const IGNORE_BELOW = 0.2

const URGENCY_LEVELS = ['Can wait', 'Normal', 'Soon', 'Urgent']

/** Options for one appraisal. */
export interface AppraiseOptions {
  /** @default 800 */
  deadlineMs?: number
  /** Answers below this confidence do not decide. Users set it. @default 0.8 */
  threshold?: number
  /** What a yes means for the attention question, for example from a module declaration. */
  attendCriteria?: string
  signal?: AbortSignal
}

/** Keeps a scene source below interruption. */
export function capSceneSalience(stimulus: Stimulus, salience: number) {
  return stimulus.fromScene ? Math.min(salience, SCENE_SALIENCE_CAP) : salience
}

/** Builds the single request for one stimulus. Its text goes into the untrusted field only. */
export function triageRequest(stimulus: Stimulus, options: AppraiseOptions = {}): ClassifierRequest {
  return {
    state: { kind: stimulus.kind, source: stimulus.source, event: stimulus.event, origin: stimulus.origin, fromScene: stimulus.fromScene === true },
    untrusted: stimulus.text,
    questions: {
      attend: {
        type: 'noul',
        instructions: 'Does this event deserve the character\'s attention now? Judge attention, not whether to reply.',
        criteria: {
          true: options.attendCriteria ?? 'The event deserves attention now.',
          false: 'The event can be ignored now.',
        },
      },
      urgency: {
        type: 'score',
        instructions: 'How soon does this event need attention?',
        criteria: URGENCY_LEVELS,
      },
    },
  }
}

/**
 * Asks a classifier about one stimulus within the deadline.
 *
 * Returns:
 * - The appraisal, or `undefined` when the classifier is late, fails, or answers without an attention value.
 */
export async function appraiseStimulus(stimulus: Stimulus, classifier: Classifier, options: AppraiseOptions = {}): Promise<IntakeAppraisal | undefined> {
  const answers = await askWithin(classifier, triageRequest(stimulus, options), { deadlineMs: options.deadlineMs, signal: options.signal })
  const attend = answers?.attend
  if (attend?.type !== 'noul' || !Number.isFinite(attend.noul))
    return undefined

  const threshold = options.threshold ?? CLASSIFIER_TRUST_THRESHOLD
  const urgency = answers?.urgency
  const urgencySalience = urgency?.type === 'score' && Number.isFinite(urgency.score) && urgency.confidence >= threshold
    ? 0.3 + Math.min(Math.max(urgency.score, 0), URGENCY_LEVELS.length - 1) / (URGENCY_LEVELS.length - 1) * 0.6
    : undefined
  return { backend: classifier.backend, attend: attend.noul, confidence: noulConfidence(attend), threshold, urgency: urgencySalience }
}

/**
 * Turns an appraisal into an attention choice. A classifier ranks work. It never grants authority.
 *
 * Returns:
 * - `ignored` for a confident answer below 0.2. Otherwise `admitted` with the prior averaged with the urgency score and capped for scene sources.
 * - A `fallback` admission with the prior when the appraisal is missing or below its threshold.
 */
export function decideByAppraisal(stimulus: Stimulus, appraisal: IntakeAppraisal | undefined): IntakeDecision & { outcome: 'admitted' | 'ignored' } {
  const prior = capSceneSalience(stimulus, stimulus.salience)
  if (!appraisal)
    return { outcome: 'admitted', reason: 'classifier-unavailable', decidedBy: 'fallback', salience: prior }
  if (appraisal.confidence < appraisal.threshold)
    return { outcome: 'admitted', reason: 'classifier-unsure', decidedBy: 'fallback', salience: prior, appraisal }
  if (appraisal.attend < IGNORE_BELOW)
    return { outcome: 'ignored', reason: 'not-attending', decidedBy: 'classifier', salience: prior, appraisal }
  const salience = appraisal.urgency === undefined ? prior : capSceneSalience(stimulus, (stimulus.salience + appraisal.urgency) / 2)
  return { outcome: 'admitted', reason: 'attending', decidedBy: 'classifier', salience, appraisal }
}
