import type { Classifier, ClassifierQuestion, ClassifierRequest } from '@proj-airi/core-agent'

import { parseClassifierAnswers, renderClassifierState, UNTRUSTED_NOTICE } from './answers'

/** Tool that the model must call with its answers. */
export const CLASSIFIER_TOOL_NAME = 'submit_answers'

/** One forced tool call. The host runs it with its chosen provider and model. */
export interface ClassifierCompletion {
  system: string
  user: string
  tool: { name: string, description: string, parameters: Record<string, unknown> }
  signal: AbortSignal
}

const confidence = { type: 'number', minimum: 0, maximum: 1, description: 'Your confidence in this answer, from 0 to 1.' }

function answerSchema(question: ClassifierQuestion): Record<string, unknown> {
  const description = question.instructions
  switch (question.type) {
    case 'noul':
      return { type: 'number', minimum: 0, maximum: 1, description: `${description}\nYes means: ${question.criteria.true}\nNo means: ${question.criteria.false}\nAnswer with the probability of yes, from 0 to 1.` }
    case 'choice':
      return {
        type: 'object',
        description: `${description}\nOptions: ${Object.entries(question.criteria).map(([name, meaning]) => `${name}: ${meaning}`).join('; ')}`,
        properties: {
          choice: { type: 'string', enum: Object.keys(question.criteria) },
          confidence,
          // Decisions API backends return a probability for every option. Asking for the same keeps mixed answers mixed.
          probabilities: {
            type: 'object',
            description: 'The probability of each option, from 0 to 1. They sum to 1.',
            properties: Object.fromEntries(Object.keys(question.criteria).map(name => [name, { type: 'number', minimum: 0, maximum: 1 }])),
            required: Object.keys(question.criteria),
            additionalProperties: false,
          },
        },
        required: ['choice', 'confidence', 'probabilities'],
        additionalProperties: false,
      }
    case 'score':
      return {
        type: 'object',
        description: `${description}\nLevels: ${question.criteria.map((level, index) => `${index}: ${level}`).join('; ')}`,
        properties: { score: { type: 'number', minimum: 0, maximum: question.criteria.length - 1 }, confidence },
        required: ['score', 'confidence'],
        additionalProperties: false,
      }
  }
}

/** Builds the forced tool call for one request. Exported for tests. */
export function classifierCompletion(request: ClassifierRequest, signal: AbortSignal): ClassifierCompletion {
  return {
    system: ['You are a decision classifier. You never write prose. Answer every question by calling the tool once.', UNTRUSTED_NOTICE].join('\n'),
    user: renderClassifierState(request),
    tool: {
      name: CLASSIFIER_TOOL_NAME,
      description: 'Submit one answer for every question.',
      parameters: {
        type: 'object',
        properties: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => [id, answerSchema(question)])),
        required: Object.keys(request.questions),
        additionalProperties: false,
      },
    },
    signal,
  }
}

/** Adds the answer type to the model's plain values, so one parser serves every backend. */
function typedAnswers(request: ClassifierRequest, value: unknown) {
  if (typeof value !== 'object' || value === null)
    return {}
  return Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
    const answer = (value as Record<string, unknown>)[id]
    return [id, question.type === 'noul' ? { type: 'noul', noul: answer } : { type: question.type, ...(answer as object) }]
  }))
}

/**
 * Classifier backed by a chat model through one forced tool call.
 *
 * Expects:
 * - `complete` returns the tool call arguments, and stops when the signal aborts.
 *
 * Returns:
 * - Answers that match their questions. The model reports its own confidence, and the user threshold applies to it like any backend.
 */
export function createLlmClassifier(complete: (completion: ClassifierCompletion) => Promise<unknown>): Classifier {
  return {
    backend: 'llm',
    async ask(request, { signal }) {
      return parseClassifierAnswers(request, typedAnswers(request, await complete(classifierCompletion(request, signal))))
    },
  }
}
