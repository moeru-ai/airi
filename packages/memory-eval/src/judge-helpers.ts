/**
 * Helper factories for LLM-based judges
 *
 * The core package is provider-agnostic. A judge only needs a chat
 * completion callback that returns a string. Wire it to any SDK you use.
 */

import type { RubricScore } from './barycenter'

export interface JudgeConfig {
  /** Character persona for scoring context */
  persona: string
  /** Weight applied to every score from this judge (default 1) */
  weight?: number
}

export type ChatFn = (prompt: string) => Promise<string>

const RUBRIC_INSTRUCTIONS = `Rate the character response on 4 dimensions.
Return JSON only, with numbers from 0 to 1:
{
  "identity": 0.0,
  "value": 0.0,
  "expression": 0.0,
  "memory": 0.0
}
identity: name, role, backstory consistency.
value: core principles and ethics alignment.
expression: speech pattern and style match.
memory: references to shared history.`

function clamp01(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(1, Math.max(0, n))
}

function extractJson(text: string): Partial<Record<keyof RubricScore, unknown>> {
  const match = text.match(/\{[\s\S]*\}/)
  if (!match) return {}
  try {
    return JSON.parse(match[0]) as Partial<Record<keyof RubricScore, unknown>>
  } catch {
    return {}
  }
}

/**
 * Create a judge from any chat-completion callback.
 *
 * @example
 * const judge = createJudge({
 *   persona: 'A physicist who loves Feynman quotes',
 *   chat: (prompt) => anthropic.messages.create({...}).then(m => m.content[0].text)
 * })
 */
export function createJudge(config: JudgeConfig & { chat: ChatFn }) {
  const { persona, weight = 1, chat } = config

  return async (response: string): Promise<RubricScore> => {
    const prompt = `${RUBRIC_INSTRUCTIONS}\n\n`
      + `Character persona: ${persona}\n`
      + `Response to rate: ${response}\n\n`
      + 'Return the JSON object.'

    const raw = await chat(prompt)
    const parsed = extractJson(raw)

    return {
      identity: clamp01(parsed.identity, 0.5),
      value: clamp01(parsed.value, 0.5),
      expression: clamp01(parsed.expression, 0.5),
      memory: clamp01(parsed.memory, 0.5),
      weight,
    }
  }
}

/**
 * Create a mock judge for tests and offline development.
 *
 * @example
 * const judge = createMockJudge({ stable: true })
 */
export function createMockJudge(options: { stable?: boolean; seed?: number } = {}) {
  const { stable = true, seed = 42 } = options
  let state = seed

  // Deterministic small PRNG so tests stay reproducible.
  const rand = () => {
    state = (state * 1664525 + 1013904223) % 2 ** 32
    return state / 2 ** 32
  }

  return async (_response: string): Promise<RubricScore> => {
    if (stable) {
      return {
        identity: 0.88 + rand() * 0.08,
        value: 0.85 + rand() * 0.08,
        expression: 0.86 + rand() * 0.08,
        memory: 0.82 + rand() * 0.08,
        weight: 1,
      }
    }
    const base = rand() * 0.4
    return {
      identity: base + rand() * 0.3,
      value: base + rand() * 0.3,
      expression: base + rand() * 0.3,
      memory: base + rand() * 0.3,
      weight: 1,
    }
  }
}
