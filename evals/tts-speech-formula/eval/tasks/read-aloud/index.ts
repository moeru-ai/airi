import type { TaskRunContext } from 'vieval/config'

import type { Language } from '../../cases/formula-speech'
import type { Grade } from '../../evaluators/grader'
import type { Reading } from '../../evaluators/judge'
import type { HearingStatus } from '../../evaluators/listener'

import { env } from 'node:process'

import { errorMessageFrom } from '@moeru/std'
import { defineMetric, defineScore, describeTask } from 'vieval'
import { createRetryPolicy, isRetriableProviderError, readRetryAfter, runWithRetry } from 'vieval/core/inference-executors'
import { modelFromEval, openaiFromRunContext } from 'vieval/plugins/chat-models'

import { formulaSpeechCases } from '../../cases/formula-speech'
import { mathBridgeCases } from '../../cases/math-bridge'
import { grade, majorityScore } from '../../evaluators/grader'
import { judgeReading, judgeVotes, medianReading, readingScores } from '../../evaluators/judge'
import { answerFormOf, listenerVotes, writeDown } from '../../evaluators/listener'
import { leftoverNotation } from '../../evaluators/notation'
import { openaiSpeechFromRunContext, speechModelFromRun, synthesize, transcribe, transcriptionModelFromEval, transcriptionRequestFromRunContext } from '../../evaluators/speech'

/**
 * `EVAL_DATASET` selects the cases: `formula-speech`, the stratified set, or `math-bridge`, a sample of arXiv formulas.
 * `EVAL_CASES` limits the run to some case ids, for example while a new rule is in progress.
 */
const dataset = env.EVAL_DATASET === 'math-bridge' ? mathBridgeCases : formulaSpeechCases
const selectedIds = env.EVAL_CASES?.split(',').map(id => id.trim()).filter(Boolean)
const cases = selectedIds?.length ? dataset.filter(item => selectedIds.includes(item.id)) : dataset

/** The listener wrote the formula back, so its reading is correct. A strict majority of the listener votes decides it. */
const correct = defineScore('formula.correct', {
  description: { 'en': 'A listener model wrote the formula back from what it heard, and the grader matched it with the reference. A strict majority of the votes decides it.', 'zh-Hans': '听写模型根据听到的内容写回公式，判分器与参考答案比对一致。多数票决定。' },
  grader: { id: 'grader', kind: 'rule', reducer: 'majority', votes: listenerVotes },
  label: { 'en': 'Written back correctly', 'zh-Hans': '听写正确' },
})
/** The judge saw a reading that says the meaning: 1 for natural, 0.5 for mixed, and 0 for spelled markup. */
const natural = defineScore('formula.natural', {
  description: { 'en': 'A judge model read the spoken text: 1 when it says the meaning, 0.5 when one or two parts spell markup, and 0 when it spells markup. It is the median of the votes.', 'zh-Hans': '评委模型阅读朗读文本：读出含义为 1，有一两处逐个念记号为 0.5，逐个念记号为 0。取投票中位数。' },
  grader: { id: 'judge', kind: 'model', reducer: 'median', votes: judgeVotes },
  label: { 'en': 'Natural reading', 'zh-Hans': '读法自然' },
})
/**
 * The headline score: the reading is correct and a listener wants to hear it. A mixed reading passes, because one word
 * for a bracket that carries meaning is not a fault. It replaces the mean of the two scores in vieval 0.9.
 */
const pass = defineScore('formula.pass', {
  combine: { all: [correct, { atLeast: readingScores.mixed, score: natural }] },
  description: { 'en': 'The reading is correct, and it is natural or mixed.', 'zh-Hans': '读法正确，并且自然或基本自然。' },
  label: { 'en': 'Correct and natural', 'zh-Hans': '正确且自然' },
  primary: true,
})

const strata = defineMetric('tts_speech_formula.stratum', {
  description: { 'en': 'The group of notation that the case covers.', 'zh-Hans': '用例覆盖的记法类别。' },
  label: { 'en': 'Stratum', 'zh-Hans': '类别' },
})
const gradingRule = defineMetric('tts_speech_formula.rule', {
  description: { 'en': 'The grader check that decided the score.', 'zh-Hans': '决定分数的判分规则。' },
  label: { 'en': 'Grading rule', 'zh-Hans': '判分规则' },
})
const leftoverSymbols = defineMetric('tts_speech_formula.leftover_notation', {
  better: 'lower',
  description: { 'en': 'Symbols and LaTeX command names that the test object left in the spoken text, so TTS gets notation instead of words. It needs no TTS.', 'zh-Hans': '测试对象留在朗读文本里的符号和 LaTeX 命令名。TTS 拿到的是符号而不是词。不需要 TTS。' },
  label: { 'en': 'Leftover notation', 'zh-Hans': '残留记号' },
  unit: 'symbols',
})
const ttsCharacters = defineMetric('tts_speech_formula.tts.characters_sent', {
  better: 'lower',
  description: { 'en': 'Characters that this run sent to the TTS provider. A cached clip sends none. Most TTS providers bill by characters.', 'zh-Hans': '本次运行发给 TTS 服务的字符数。命中缓存时为 0。多数 TTS 服务按字符计费。' },
  label: { 'en': 'TTS characters sent', 'zh-Hans': 'TTS 发送字符数' },
  unit: 'characters',
})
const asrRequests = defineMetric('tts_speech_formula.asr.requests', {
  better: 'lower',
  description: { 'en': 'ASR requests that this run sent. A cached transcript sends none.', 'zh-Hans': '本次运行发出的 ASR 请求数。命中缓存时为 0。' },
  label: { 'en': 'ASR requests', 'zh-Hans': 'ASR 请求数' },
  unit: 'requests',
})
const hearing = defineMetric('tts_speech_formula.hearing', {
  description: { 'en': 'How well the listener could hear the case: ok, partial, or unclear. It is the status of most votes, and the worse one on a tie.', 'zh-Hans': '听写者能否听清：ok、partial 或 unclear。取多数票的状态，平票时取更差的。' },
  label: { 'en': 'Hearing', 'zh-Hans': '可听清程度' },
})
const readingMetric = defineMetric('tts_speech_formula.reading', {
  description: { 'en': 'How the judge saw the reading: natural says the meaning, spelled reads the markup, and mixed is between. It is the median of the judge votes.', 'zh-Hans': '评委对朗读方式的判断：natural 读出含义，spelled 逐个念记号，mixed 介于两者之间。取评委投票的中位数。' },
  label: { 'en': 'Reading', 'zh-Hans': '朗读方式' },
})
const votes = defineMetric('tts_speech_formula.votes', {
  description: { 'en': 'The grade of each listener answer. The case passes with a strict majority.', 'zh-Hans': '每次听写的得分。多数票通过才算通过。' },
  label: { 'en': 'Listener votes', 'zh-Hans': '听写投票' },
})

/** Worst first, so a tie between two statuses selects the worse one. */
const hearingOrder: readonly HearingStatus[] = ['unclear', 'partial', 'ok']

/**
 * The hearing status of a case: the status of most votes. On a tie, the worse status wins, so one clear vote
 * does not hide that the other votes could not hear the clip.
 *
 * @example
 * majorityHearing(['ok', 'unclear', 'unclear'])
 * // => 'unclear'
 * majorityHearing(['ok', 'partial', 'unclear'])
 * // => 'unclear'
 */
function majorityHearing(statuses: readonly HearingStatus[]): HearingStatus {
  let selected = hearingOrder[0]!
  let selectedCount = -1
  for (const status of hearingOrder) {
    const count = statuses.filter(item => item === status).length
    if (count > selectedCount) {
      selected = status
      selectedCount = count
    }
  }
  return selected
}

/**
 * What a read-aloud adapter gets besides the reply: the case context of vieval.
 * An adapter that calls a model resolves it from `models` and `task.matrix`, caches its answers in `cache`,
 * and reports its usage to `events`, for example with `generateTextWithTelemetry`.
 */
export type ReadAloudContext = TaskRunContext & { signal: AbortSignal }

/**
 * The adapter of a test object: it turns one reply into the text that a TTS provider reads.
 * Each test object under `eval/test-objects/` implements one.
 */
export type ReadAloud = (markdown: string, language: Language, context: ReadAloudContext) => Promise<string>

// WORKAROUND:
// Some calls never answer, and one case then holds the whole run for many minutes.
// The official StepFun TTS sometimes holds a request open for more than 5 minutes, and a model can write without end.
// Source: T-152 §5.1 (StepFun hangs over 5 minutes), and the Korean `rel-parallel` case on 2026-10-19.
// Remove when every provider answers or fails within this time. The timeout fails the try, and `step` sends the call again.
const stepTimeoutMs = 120_000

/** Total tries of one step, including the first. The waits between them add up to about 70 seconds. */
const stepMaxAttempts = 4

// WORKAROUND:
// The listener and rewrite proxies answer 429 `model_cooldown` for some seconds when four workspaces call them at once,
// and the ASR proxy sometimes drops the TLS connection. The case retry of vieval waited only 0.5, 1, and 2 seconds,
// so all retries of a case failed inside one cooldown.
// Source: the comparison run attempt-2026-10-19T06-36-24-868Z, where 93 `llm` cases and 33 `rule` cases failed this way.
// Remove when vieval limits and cools down calls per provider across workspaces.
/**
 * Wait before retry `attempt` of a step: the provider's `Retry-After` when it sent a longer one, else 10, 20, then
 * 40 seconds, plus up to a quarter more.
 * The default backoff of vieval starts at 0.5 seconds, which is far shorter than one cooldown of the proxies.
 * The random part spreads the cases that one cooldown stopped together, so they do not call again at the same moment.
 */
function stepRetryDelayMs(attempt: number, error: unknown): number {
  const backoffMs = 10_000 * 2 ** (attempt - 1)
  return Math.max(readRetryAfter(error) ?? 0, backoffMs + Math.random() * backoffMs / 4)
}

/**
 * Retries the calls that a rate limit, a server error, a dropped connection, or a timeout stopped
 * (`isRetriableProviderError` of vieval). `runWithRetry` stops waiting and retrying once the run is interrupted.
 */
const stepRetryPolicy = createRetryPolicy({ delayMs: stepRetryDelayMs, maxAttempts: stepMaxAttempts })

/** The provider error that `step` wrapped, or the error itself when no step wrapped it. */
function causeOf(error: unknown): unknown {
  return error instanceof Error && error.cause != null ? error.cause : error
}

/**
 * Runs one external call with a timeout and names it in the error.
 * A retriable failure tries the call again after a wait (`stepRetryPolicy`). Other errors and an aborted run fail
 * the step at once.
 * Node reports a network failure as `fetch failed` and keeps the reason, for example `ECONNRESET`, in `cause`.
 * The report then shows the step, the message, and the reason together. The thrown error keeps the provider error
 * in `cause`, so the case retry below can still classify it.
 */
async function step<T>(name: string, signal: AbortSignal, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  try {
    return await runWithRetry(() => run(AbortSignal.any([signal, AbortSignal.timeout(stepTimeoutMs)])), stepRetryPolicy, { signal })
  }
  catch (error) {
    const cause = error instanceof Error && error.cause != null ? ` (${errorMessageFrom(error.cause) ?? 'no reason'})` : ''
    throw new Error(`${name}: ${errorMessageFrom(error) ?? 'unknown error'}${cause}`, { cause: error })
  }
}

/**
 * Registers the read-aloud task of one language for one test object.
 *
 * WORKAROUND:
 * Each language has its own eval file, because two tasks of one file overwrite each other's cases.
 * In vieval 0.4.0, the task id comes from the eval file, not from the `describeTask` name, so both tasks get one id.
 * Source: the first comparison run, where the `zh` cases of a file disappeared behind the `en` cases.
 * Remove when vieval derives the task id from the task name. Then one eval file can register all four languages.
 *
 * Call stack:
 *
 * eval/test-objects/<object>/tasks/read-aloud/formula-speech/<language>.eval.ts
 *   -> {@link describeFormulaSpeechTask}
 *     -> {@link ReadAloud} of the test object, then synthesize and transcribe (../../evaluators/speech) unless `tts` is `none`
 *       -> writeDown (./listener), one call per vote
 *         -> grade (./score)
 */
export function describeFormulaSpeechTask(language: Language, readAloud: ReadAloud) {
  describeTask(language, ({ casesFromInputs }) => {
    casesFromInputs('case', cases, async (context) => {
      const item = context.matrix.inputs
      // `none` sends the spoken text straight to the listener. It measures what AIRI hands to TTS, independent of any provider.
      const tts = String(context.task.matrix.run.tts)
      const { cache, signal } = context

      // Reports of different test objects match one sample by this id, so it leaves the test object out.
      context.recordMetric('benchmark.case.id', `${item.id}|${language}|${tts}`)
      context.recordMetric(strata, item.stratum)

      const markdown = typeof item.input === 'string' ? item.input : item.input[language]
      const spoken = await step('read aloud', signal, stepSignal => readAloud(markdown, language, { ...context, signal: stepSignal }))
      const leftover = leftoverNotation(spoken, markdown)
      context.recordMetric(leftoverSymbols, leftover.length)
      await context.recordArtifact('spoken.txt', { body: `${spoken}\n`, contentType: 'text/plain', label: { 'en': 'Spoken text', 'zh-Hans': '朗读文本' }, purpose: 'tts_speech_formula.spoken_text' })

      let heard = spoken
      if (tts !== 'none' && spoken.trim()) {
        const speech = openaiSpeechFromRunContext(speechModelFromRun(context, { axis: 'tts' }))
        const clip = await step(`TTS ${speech.model}`, signal, stepSignal => synthesize(speech, spoken, language, cache, stepSignal))
        await context.recordArtifact('speech.mp3', { contentType: 'audio/mpeg', label: { 'en': 'Speech', 'zh-Hans': '语音' }, path: clip.path, purpose: 'tts_speech_formula.speech' })
        const asrModel = transcriptionModelFromEval(context, { axis: 'asr' })
        const transcription = transcriptionRequestFromRunContext(asrModel, { language })
        const transcript = await step(`ASR ${asrModel.id}`, signal, stepSignal => transcribe(transcription, asrModel.id, clip, language, cache, stepSignal))
        heard = transcript.text
        // Chat calls report token usage through vieval inference events. TTS and ASR calls are not chat calls,
        // and the vieval event schema accepts only chat, so their billing basis goes into metrics.
        context.recordMetric(ttsCharacters, clip.cached ? 0 : spoken.length)
        context.recordMetric(asrRequests, transcript.cached ? 0 : 1)
      }

      const listener = openaiFromRunContext(modelFromEval(context, { axis: 'listener' }))
      // An OpenAI-compatible provider without a base URL is OpenAI itself.
      const endpoint = { apiKey: listener.apiKey, baseURL: listener.baseURL || 'https://api.openai.com/v1/', model: listener.model }
      let answers: Awaited<ReturnType<typeof writeDown>>[] = []
      let grades: Grade[] = []
      let score: 0 | 1 | undefined
      // An empty transcript of a spoken clip says nothing about the reading: the Gemini ASR returned nothing for some
      // long Chinese, Japanese, and Korean clips in every run. The case keeps its judge score, and its correctness is unscored.
      if (tts !== 'none' && spoken.trim() && !heard.trim()) {
        context.recordUnscored(correct, 'asr_empty', { rationale: 'The ASR returned an empty transcript.' })
      }
      else {
        const form = answerFormOf(item.mode)
        answers = await step(`listener ${endpoint.model}`, signal, stepSignal => Promise.all(Array.from({ length: listenerVotes }, (_, vote) => writeDown(heard, language, form, vote, endpoint, context, stepSignal))))
        // An unintelligible vote scores 0 under its own rule, so a report tells an unclear clip apart from a wrong reading.
        grades = answers.map((answer): Grade => answer.status === 'unclear' ? { score: 0, rule: 'unclear' } : grade(item, answer.latex))
        score = majorityScore(grades.map(({ score: vote }) => vote))
        context.recordMetric(hearing, majorityHearing(answers.map(({ status }) => status)))

        // A score of 0 is a result, not a failure. The case fails only when a provider, a model, or the listener cannot be reached.
        const rule = grades.find(({ score: vote }) => vote === score)?.rule ?? grades[0]!.rule
        context.recordScore(correct, score, { metadata: { listener: endpoint.model }, rationale: `${grades.map(({ score: vote }) => vote).join(', ')} by ${rule}` })
        context.recordMetric(votes, grades.map(({ score: vote }) => vote))
        context.recordMetric(gradingRule, rule)
      }

      // The listener checks that the reading is correct. The judge checks that it says the meaning instead of spelling
      // markup, because a listener model can write down "open parenthesis x close parenthesis" as well as "of x".
      // The judge reads the spoken text, not the transcript, so it judges only the test object.
      const judge = openaiFromRunContext(modelFromEval(context, { axis: 'judge' }))
      const judgeEndpoint = { apiKey: judge.apiKey, baseURL: judge.baseURL || 'https://api.openai.com/v1/', model: judge.model }
      const verdicts = await step(`judge ${judgeEndpoint.model}`, signal, stepSignal => Promise.all(Array.from({ length: judgeVotes }, (_, vote) => judgeReading(spoken, markdown, language, vote, judgeEndpoint, context, stepSignal))))
      const reading: Reading = medianReading(verdicts)
      context.recordScore(natural, readingScores[reading], {
        grader: { id: 'judge', kind: 'model', model: judgeEndpoint.model, reducer: 'median', votes: judgeVotes },
        rationale: verdicts.find(verdict => verdict.reading === reading)?.reason,
      })
      context.recordMetric(readingMetric, reading)
      await context.recordArtifact('result.json', {
        body: `${JSON.stringify({ id: item.id, language, tts, markdown, spoken, leftover, heard, reference: item.reference, answers, grades, score, verdicts, reading }, null, 2)}\n`,
        contentType: 'application/json',
        label: { 'en': 'Result', 'zh-Hans': '结果' },
        purpose: 'tts_speech_formula.result',
      })
    })
  }, {
    // `pass` is derived from the two recorded scores, so the task announces it before the first case.
    scores: [correct, natural, pass],
    // WORKAROUND:
    // Providers sometimes drop a connection, and the case fails with `fetch failed` for a reason outside the test object.
    // The ASR proxy and the listener proxy dropped some requests during the first full runs.
    // Source: the `ja` and `ko` cases of the official TTS in the smoke run on 2026-10-19, which passed when run again.
    // Remove when the providers are stable. A retry replays the case, but every finished step returns from the cache,
    // so only the failed call runs again. A score of 0 is not a failure, so retries never hide a wrong reading.
    // `step` already retries the calls that a rate limit or a dropped connection stops, so this retry is the last
    // resort when a provider stays unavailable for all tries of a step. It waits 60 seconds, longer than one cooldown
    // of the proxies, or the provider's `Retry-After` when that is longer.
    // `step` wraps the provider error in `cause`. A bug or a grader error is not a provider error, so it fails at once.
    autoRetry: 1,
    autoRetryDelay: (_retryIndex, error) => Math.max(readRetryAfter(causeOf(error)) ?? 0, 60_000),
    autoRetryIf: error => isRetriableProviderError(causeOf(error)),
  })
}
