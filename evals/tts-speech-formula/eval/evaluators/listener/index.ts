import type { TaskRunContext } from 'vieval/config'

import type { GradingMode } from '../../cases/formula-speech/cases'
import type { Language } from '../../cases/formula-speech/languages'

import { object, parse, picklist, string } from 'valibot'

import { languageName } from '../../cases/formula-speech/languages'
import { cacheKey } from '../../shared/cache-key'
import { generateTextWithTelemetry } from '../../shared/telemetry'
import { renderVelinPrompt } from '../../shared/velin'

/** An OpenAI-compatible endpoint and the model to call on it. */
export interface Endpoint {
  baseURL: string
  apiKey: string
  model: string
}

/** What the listener is told about the form of the audio. It never sees the reference. */
export type AnswerForm = 'formula' | 'chem' | 'sentence'

/**
 * The system prompt of the listener. It asks for a literal transcription, never a correction toward a known formula,
 * so that a misread formula stays wrong and the deterministic grader can see it.
 */
export function listenerPrompt(language: Language, form: AnswerForm): Promise<string> {
  return renderVelinPrompt(new URL('./listener.velin.md', import.meta.url), { language: languageName[language], form })
}

/**
 * Independent listener answers per case. The case passes with a strict majority of passing answers.
 * Three votes hold an unstable answer of the listener model to one vote of three.
 */
export const listenerVotes = 3

export function answerFormOf(mode: GradingMode): AnswerForm {
  if (mode === 'chem')
    return 'chem'
  if (mode === 'currency')
    return 'sentence'
  return 'formula'
}

/**
 * How well the listener could hear the transcript.
 *
 * - `ok`: it heard all of it.
 * - `partial`: some parts were garbled or missing. The answer has the parts that it heard, and the grader grades it.
 * - `unclear`: nothing was recoverable. The grader scores the vote 0 with the rule `unclear`, so a report can tell
 *   an unintelligible clip apart from a wrong reading.
 */
export type HearingStatus = 'ok' | 'partial' | 'unclear'

/** One vote of the listener. */
export interface ListenerAnswer {
  /** The LaTeX that the listener wrote down. Empty when the status is `unclear` or the transcript was empty. */
  latex: string
  status: HearingStatus
}

/** The answer contract in `listener.velin.md`. The JSON Schema below sends the same shape to the provider. */
const answerSchema = object({ latex: string(), status: picklist(['ok', 'partial', 'unclear']) })

/** Structured output, so the hearing status is a field and never mixed into the LaTeX. */
const answerFormat = {
  type: 'json_schema',
  json_schema: {
    name: 'listener_answer',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['latex', 'status'],
      properties: {
        latex: { type: 'string' },
        status: { type: 'string', enum: ['ok', 'partial', 'unclear'] },
      },
    },
  },
}

/** JSON escapes that are also the first letter of a TeX command: `\f` of `\frac`, `\t` of `\times`, `\n` of `\neq`. */
const swallowedCommandLetters: Readonly<Record<string, string>> = { '\f': 'f', '\t': 't', '\n': 'n', '\b': 'b', '\r': 'r' }

/**
 * Restores TeX commands that a JSON parser turned into control characters.
 *
 * A model can write `"\frac"` in its JSON answer without escaping the backslash. `JSON.parse` then reads `\f` as a form
 * feed, and the answer becomes `rac{1}{x}`. A LaTeX answer has no control characters, so each one is a lost command.
 * Cached answers from before this repair get it when they are read.
 *
 * @example
 * // JSON.parse('{"latex": "x^{-1}=\frac{1}{x}"}').latex has a form feed in place of `\f`.
 * restoreTexCommands('x^{-1}=\u000Crac{1}{x}')
 * // => 'x^{-1}=\\frac{1}{x}'
 */
function restoreTexCommands(latex: string): string {
  return latex.replace(/[\f\t\n\u0008\r]/g, control => `\\${swallowedCommandLetters[control]}`)
}

/** True when a LaTeX answer still holds words: CJK text, or a Latin word of four or more letters outside commands. */
function hasWords(answer: string): boolean {
  const bare = answer.replace(/\\[A-Z]+/gi, ' ')
  return /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}\p{Script=Hangul}]/u.test(bare) || /[A-Za-z][a-z]{3,}/.test(bare)
}

/** The model sometimes answers with display math over several lines. All of it is kept, on one line. */
function oneLine(answer: string): string {
  return answer.trim().split('\n').map(line => line.trim()).filter(Boolean).join(' ')
}

async function ask(endpoint: Endpoint, system: string, prompt: string, context: TaskRunContext, signal: AbortSignal): Promise<ListenerAnswer> {
  const { text } = await generateTextWithTelemetry(context, 'listener', {
    ...endpoint,
    abortSignal: signal,
    // WORKAROUND:
    // A garbled transcript makes the listener model write without end, and the case never finishes.
    // whisper-1 can fall into a repetition loop on a short clip, for example `L-R-R-R-...` for Korean `l 1은 l 2와 평행`.
    // Source: the `rel-parallel` case in Korean on the official StepFun TTS, 2026-10-19. T-157 used the same cap.
    // Remove when the listener model stops on its own for such input. The step timeout in tasks/read-aloud stays as a backstop.
    maxCompletionTokens: 2000,
    messages: [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    responseFormat: answerFormat,
    temperature: 0,
  })
  // A malformed answer throws. The case then fails as a listener error instead of scoring a wrong 0.
  const answer = parse(answerSchema, JSON.parse(text ?? ''))
  return { latex: oneLine(restoreTexCommands(answer.latex)), status: answer.status }
}

/**
 * Writes down, as LaTeX, what the listener heard, with how well it could hear it.
 * An empty transcript makes no call and is `unclear`.
 *
 * Each vote is cached by model, prompt, transcript, and vote number. An unchanged transcript therefore gets the same answer
 * in every run, and run-to-run noise comes only from the system under test.
 * A formula answer that still holds words gets one format repair. The repair is kept only when it is clean.
 * `context` is the case context: it holds the cache, and it receives the usage of each call that reaches the model.
 */
export async function writeDown(heard: string, language: Language, form: AnswerForm, vote: number, endpoint: Endpoint, context: TaskRunContext, signal: AbortSignal): Promise<ListenerAnswer> {
  if (!heard.trim())
    return { latex: '', status: 'unclear' }

  const system = await listenerPrompt(language, form)
  const file = context.cache.namespace('listener').file({ ext: 'json', key: [endpoint.model, cacheKey(system, heard, String(vote))] })
  if (await file.exists()) {
    const cached = await file.readJson<ListenerAnswer>()
    return { ...cached, latex: restoreTexCommands(cached.latex) }
  }

  const prompt = `ASR transcript: ${heard}`
  let answer = await ask(endpoint, system, prompt, context, signal)
  if (form !== 'sentence' && answer.status !== 'unclear' && hasWords(answer.latex)) {
    const repaired = await ask(endpoint, system, `${prompt}\nYour previous answer was: ${answer.latex}\nIt still contains words. Write it again as notation only, still exactly as heard.`, context, signal)
      // A failed repair keeps the first answer. The grader then scores it as written.
      .catch(() => answer)
    if (!hasWords(repaired.latex))
      answer = repaired
  }

  await file.writeJson(answer)
  return answer
}
