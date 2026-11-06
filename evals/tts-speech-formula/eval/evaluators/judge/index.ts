import type { TaskRunContext } from 'vieval/config'

import type { Language } from '../../cases/formula-speech/languages'
import type { Endpoint } from '../listener'

import { object, parse, picklist, string } from 'valibot'

import { languageName } from '../../cases/formula-speech/languages'
import { cacheKey } from '../../shared/cache-key'
import { generateTextWithTelemetry } from '../../shared/telemetry'
import { renderVelinPrompt } from '../../shared/velin'

/**
 * How a reading says a formula.
 *
 * - `natural`: it says the meaning, as a teacher reads the formula to a class.
 * - `mixed`: it is mostly natural, with one or two parts that spell markup.
 * - `spelled`: it spells the markup, for example "open parenthesis x close parenthesis", or leaves the source.
 */
export type Reading = 'natural' | 'mixed' | 'spelled'

/**
 * The judge score of each reading, recorded as `formula.natural`. The headline score `formula.pass` needs a correct
 * reading and at least the mixed score, so a reading that the listener can write down but that spells markup fails.
 */
export const readingScores: Readonly<Record<Reading, number>> = { natural: 1, mixed: 0.5, spelled: 0 }

/** Independent judge answers per case. The case takes the median, so one unstable answer does not decide it. */
export const judgeVotes = 3

/** One vote of the judge. */
export interface Verdict {
  reading: Reading
  /** One short sentence that names the spelled parts. Reports show it, so a reader can check the judge. */
  reason: string
}

/** The answer contract in `judge.velin.md`. The JSON Schema below sends the same shape to the provider. */
const verdictSchema = object({ reason: string(), reading: picklist(['natural', 'mixed', 'spelled']) })

const verdictFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'judge_verdict',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      // The reason comes first, so the model names the spelled parts before it chooses the reading.
      required: ['reason', 'reading'],
      properties: {
        reason: { type: 'string' },
        reading: { type: 'string', enum: ['natural', 'mixed', 'spelled'] },
      },
    },
  },
}

/** The system prompt of the judge. It judges only the style of a reading. The listener and the grader judge correctness. */
export function judgePrompt(language: Language): Promise<string> {
  return renderVelinPrompt(new URL('./judge.velin.md', import.meta.url), { language: languageName[language] })
}

/**
 * The median reading of several votes. With three votes, two votes decide, and a tie of three different readings
 * selects `mixed`.
 *
 * @example
 * medianReading([{ reading: 'natural', reason: '' }, { reading: 'spelled', reason: '' }, { reading: 'natural', reason: '' }])
 * // => 'natural'
 */
export function medianReading(verdicts: readonly Verdict[]): Reading {
  const sorted = verdicts.map(({ reading }) => reading).sort((left, right) => readingScores[left] - readingScores[right])
  return sorted[Math.floor((sorted.length - 1) / 2)] ?? 'spelled'
}

/**
 * Judges whether a reading says the meaning of a formula or spells its markup.
 *
 * It judges the spoken text that the test object sends to TTS, not the ASR transcript, because ASR errors are not part
 * of the reading. An empty reading makes no call and is `spelled`: it says nothing of the formula.
 *
 * Each vote is cached by model, prompt, source, reading, and vote number, so an unchanged reading gets the same verdict
 * in every run and under every TTS model. `context` receives the usage of each call that reaches the model.
 */
export async function judgeReading(spoken: string, source: string, language: Language, vote: number, endpoint: Endpoint, context: TaskRunContext, signal: AbortSignal): Promise<Verdict> {
  if (!spoken.trim())
    return { reading: 'spelled', reason: 'The reading is empty.' }

  const system = await judgePrompt(language)
  const file = context.cache.namespace('judge').file({ ext: 'json', key: [endpoint.model, cacheKey(system, source, spoken, String(vote))] })
  if (await file.exists())
    return file.readJson<Verdict>()

  const { text } = await generateTextWithTelemetry(context, 'judge', {
    ...endpoint,
    abortSignal: signal,
    maxCompletionTokens: 400,
    messages: [{ role: 'system', content: system }, { role: 'user', content: `LaTeX source: ${source}\nSpoken text: ${spoken}` }],
    responseFormat: verdictFormat,
    temperature: 0,
  })
  // A malformed verdict throws. The case then fails as a judge error instead of scoring a wrong 0.
  const verdict = parse(verdictSchema, JSON.parse(text ?? ''))
  await file.writeJson(verdict)
  return verdict
}
