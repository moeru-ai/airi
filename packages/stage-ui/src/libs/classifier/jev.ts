import type { Classifier, ClassifierQuestion, ClassifierRequest } from '@proj-airi/core-agent'

import { parseClassifierAnswers, renderClassifierState, UNTRUSTED_NOTICE } from './answers'

/** Connection to the TypeSafe System One API. */
export interface JevClassifierOptions {
  apiKey: string
  /** @default 'https://api.typesafe.ai/v1/' */
  baseURL?: string
  /** @default 'jev-latest' */
  model?: string
  fetch?: typeof globalThis.fetch
}

/** Maps one question to the API form. `criteria` holds options or levels there, so module guidance joins the instructions. */
function toJevQuestion(question: ClassifierQuestion) {
  const instructions = [question.instructions, question.criteria, UNTRUSTED_NOTICE].filter(Boolean).join('\n')
  switch (question.type) {
    case 'noul':
      return { type: 'noul', instructions }
    case 'choice':
      return { type: 'choice', instructions, criteria: question.options }
    case 'score':
      return { type: 'score', instructions, criteria: question.levels }
  }
}

/** Builds the request body. Exported for tests. */
export function jevRequestBody(request: ClassifierRequest, model: string) {
  return {
    model,
    state: renderClassifierState(request),
    questions: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => [id, toJevQuestion(question)])),
  }
}

/**
 * Classifier backed by JEV through `POST /systemone`.
 *
 * Returns:
 * - Answers that match their questions. A failed request throws, and the caller falls back to deterministic rules.
 */
export function createJevClassifier(options: JevClassifierOptions): Classifier {
  const fetcher = options.fetch ?? globalThis.fetch
  const baseURL = options.baseURL ?? 'https://api.typesafe.ai/v1/'
  const model = options.model ?? 'jev-latest'

  return {
    backend: 'jev',
    async ask(request, { signal }) {
      const response = await fetcher(new URL('systemone', baseURL.endsWith('/') ? baseURL : `${baseURL}/`), {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${options.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(jevRequestBody(request, model)),
        signal,
      })
      if (!response.ok)
        throw new Error(`JEV request failed with ${response.status}: ${await response.text().catch(() => '')}`)
      const body = await response.json() as { answers?: unknown }
      return parseClassifierAnswers(request, body.answers)
    },
  }
}
