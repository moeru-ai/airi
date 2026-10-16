import type { TurnEvidence, VoicePlugin } from '@proj-airi/core-agent'

/** Whether the speaker finished the message, as a chat model reads the transcript. */
export type EndJudgement = 'complete' | 'incomplete'

export interface VoiceEndJudgeOptions {
  /** Reads the setting when an input starts. A disabled input ends only by the voice activity silence limit. */
  enabled: () => boolean
  /**
   * Reads the transcript of a paused input. A rejection counts as `incomplete`, so the silence limit ends the input.
   * `signal` aborts when the speaker continues or the input ends.
   */
  judge: (transcript: string, context: TurnEvidence['context'], signal: AbortSignal) => Promise<EndJudgement>
  /**
   * Silence after the last speech that starts a judgement. Shorter pauses are breaths between words.
   *
   * @default 1200
   */
  pauseMs?: number
}

/** The evidence state that one judgement answers. A change of any part makes the judgement stale. */
function evidenceKey(evidence: TurnEvidence) {
  return `${evidence.transcript.revision}:${evidence.speechRevision}:${evidence.context.revision}`
}

/**
 * Ends a paused speech input early when a chat model reads its transcript as a complete message.
 *
 * The voice activity plugin ends an input after a long silence limit, so a speaker can stop to think and continue.
 * This plugin shortens the wait for a finished message. It installs an end detector on each input. A pause of
 * `pauseMs` after the last speech starts one judgement for the current transcript. A `complete` judgement ends the
 * input. An `incomplete` or failed judgement waits for more speech or for the silence limit.
 *
 * State for one input:
 * - `speechRevision` and `pauseStart` follow VAD evidence. A new speech revision restarts the pause.
 * - `current` is the judgement of one evidence state. It runs in the background, so a slow model never holds back
 *   new evidence. A later window reads its result. New evidence aborts it, and the core rejects an `end` for stale evidence.
 *
 * Use when:
 * - Install it on a controller with the `input-control` grant, together with a voice activity plugin.
 *
 * Returns:
 * - A voice plugin named `voice-end-judge`.
 */
export function createVoiceEndJudgePlugin(options: VoiceEndJudgeOptions): VoicePlugin {
  const pauseMs = options.pauseMs ?? 1200

  return {
    name: 'voice-end-judge',
    setup(scope) {
      scope.onSpeechInput((input) => {
        if (!options.enabled())
          return undefined

        input.task({ name: 'end-judge', selection: { transcript: 'raw' } }, async (ctx) => {
          // A task reaches only the input that it belongs to. Another active input means this one already ended.
          const control = ctx.controls.activeInput()
          if (control?.id !== input.inputId)
            return

          let speechRevision = 0
          let pauseStart = 0
          let current: { key: string, abort: AbortController, result?: EndJudgement } | undefined

          const installed = control.detectEnd({ windowMs: 100, hopMs: 100, activity: 'ordered' }, async (evidence, signal) => {
            const { range, sampleRate } = evidence.audio
            if (evidence.speechRevision !== speechRevision) {
              speechRevision = evidence.speechRevision
              pauseStart = range.endFrame
            }

            // Before the first speech, silence is the wait after a wake word, not the end of a message.
            const pausedMs = (range.endFrame - pauseStart) * 1000 / sampleRate
            const text = evidence.transcript.text.trim()
            if (speechRevision === 0 || pausedMs < pauseMs || !text)
              return 'continue'

            const key = evidenceKey(evidence)
            if (current?.key !== key) {
              current?.abort.abort('Speech evidence changed')
              const judgement: NonNullable<typeof current> = { key, abort: new AbortController() }
              current = judgement
              void options.judge(text, evidence.context, AbortSignal.any([judgement.abort.signal, signal]))
                .catch((): EndJudgement => 'incomplete')
                .then(result => judgement.result = result)
            }

            return current.result === 'complete' ? 'end' : 'continue'
          })
          if (installed.status !== 'installed')
            return

          await installed.observer.done
          current?.abort.abort('Speech input ended')
        })
        return undefined
      })
      return undefined
    },
  }
}
