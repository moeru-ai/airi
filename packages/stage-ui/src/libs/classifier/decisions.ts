import type { Classifier, ClassifierRequest } from '@proj-airi/core-agent'

import { parseClassifierAnswers, renderClassifierState, UNTRUSTED_NOTICE } from './answers'

/** OpenRouter's Decisions endpoint. TypeSafe serves the same schema at `https://api.typesafe.ai/v1/systemone`. */
export const DEFAULT_DECISIONS_ENDPOINT = 'https://openrouter.ai/api/v1/api/alpha/decisions'
export const DEFAULT_DECISIONS_MODEL = 'inception/mercury-decide:free'

/** Connection to a Decisions API endpoint. */
export interface DecisionsClassifierOptions {
  apiKey: string
  /** @default {@link DEFAULT_DECISIONS_ENDPOINT} */
  endpoint?: string
  /** @default {@link DEFAULT_DECISIONS_MODEL} */
  model?: string
  fetch?: typeof globalThis.fetch
}

/** Builds the request body. The questions already use the API's `criteria` forms. */
function decisionsRequestBody(request: ClassifierRequest, model: string) {
  return {
    model,
    state: renderClassifierState(request),
    questions: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => [id, {
      ...question,
      instructions: [question.instructions, UNTRUSTED_NOTICE].join('\n'),
    }])),
  }
}

/**
 * Classifier backed by a Decisions API endpoint, for example OpenRouter or TypeSafe.
 *
 * Returns:
 * - Answers that match their questions. A failed request throws, and the caller falls back to fixed rules.
 */
export function createDecisionsClassifier(options: DecisionsClassifierOptions): Classifier {
  const fetcher = options.fetch ?? globalThis.fetch
  const model = options.model || DEFAULT_DECISIONS_MODEL

  return {
    backend: 'decisions',
    async ask(request, { signal }) {
      const response = await fetcher(options.endpoint || DEFAULT_DECISIONS_ENDPOINT, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(decisionsRequestBody(request, model)),
        signal,
      })
      if (!response.ok)
        throw new Error(`Decisions request failed with ${response.status}: ${await response.text().catch(() => '')}`)
      const body = await response.json() as { answers?: unknown }
      return parseClassifierAnswers(request, body.answers)
    },
  }
}
