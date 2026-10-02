// Question and answer shapes follow the Decisions API that OpenRouter and TypeSafe serve.

/** A yes-or-no question. The answer is the probability of yes. */
export interface NoulQuestion {
  type: 'noul'
  instructions: string
  /** What yes and no mean. */
  criteria: { true: string, false: string }
}

/** Picks one named option. */
export interface ChoiceQuestion {
  type: 'choice'
  instructions: string
  /** Option name to its meaning. */
  criteria: Record<string, string>
}

/** Rates on an ordered scale. Level `0` is the lowest. */
export interface ScoreQuestion {
  type: 'score'
  instructions: string
  /** Level meanings, lowest first. */
  criteria: string[]
}

export type ClassifierQuestion = NoulQuestion | ChoiceQuestion | ScoreQuestion

export interface NoulAnswer {
  type: 'noul'
  /** Probability of yes, from 0 to 1. */
  noul: number
}

export interface ChoiceAnswer {
  type: 'choice'
  choice: string
  confidence: number
  probabilities?: Record<string, number>
}

export interface ScoreAnswer {
  type: 'score'
  /** Probability-weighted level, from 0 to the highest level index. */
  score: number
  confidence: number
  probabilities?: Record<string, number>
}

export type ClassifierAnswer = NoulAnswer | ChoiceAnswer | ScoreAnswer

/** Input for one classifier call. All questions about one event go in one call. */
export interface ClassifierRequest {
  /** Fields the decision needs, already reduced to what the questions read. */
  state: Record<string, unknown>
  /** External text. Backends put it in its own state field and mark it as data, never as instructions. */
  untrusted?: string
  questions: Record<string, ClassifierQuestion>
}

/**
 * A decision model that answers typed questions with probabilities. It never generates text.
 *
 * Expects:
 * - `ask` stops work when `signal` aborts.
 *
 * Returns:
 * - One answer per question id. A missing or mistyped answer counts as no answer.
 */
export interface Classifier {
  /** Backend name for the intake trace, for example `jev` or `llm`. */
  readonly backend: string
  ask: (request: ClassifierRequest, options: { signal: AbortSignal }) => Promise<Record<string, ClassifierAnswer>>
}

/** Answers below this confidence fall back to deterministic rules. */
export const CLASSIFIER_TRUST_THRESHOLD = 0.8

/** Default deadline for one classifier call. A late answer falls back to deterministic rules. */
export const CLASSIFIER_DEADLINE_MS = 800

/**
 * Asks a classifier within a deadline.
 *
 * Returns:
 * - The answers, or `undefined` when the classifier fails, is late, or the caller aborts. The call is aborted at the deadline.
 */
export async function askWithin(classifier: Classifier, request: ClassifierRequest, options: { deadlineMs?: number, signal?: AbortSignal } = {}): Promise<Record<string, ClassifierAnswer> | undefined> {
  const controller = new AbortController()
  const abort = () => controller.abort(options.signal?.reason)
  options.signal?.addEventListener('abort', abort, { once: true })
  let timer: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => {
      controller.abort(new Error('Classifier deadline exceeded'))
      resolve(undefined)
    }, options.deadlineMs ?? CLASSIFIER_DEADLINE_MS)
  })
  try {
    return await Promise.race([
      classifier.ask(request, { signal: controller.signal }).catch(() => undefined),
      deadline,
    ])
  }
  finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
  }
}

/** Confidence of a yes-or-no answer: how far it is from a coin flip. */
export function noulConfidence(answer: NoulAnswer) {
  return Math.max(answer.noul, 1 - answer.noul)
}
