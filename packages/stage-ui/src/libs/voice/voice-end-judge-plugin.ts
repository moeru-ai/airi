import type { EndJudgement } from '@proj-airi/agents/voice-end-judge'
import type { ConversationContext, VoicePlugin } from '@proj-airi/core-agent'

import {
  createEndJudgementRule,
  createPauseRule,
  endJudgedSignal,
  inputActivitySignal,
  inputFinalizingEvent,
  inputSettledEvent,
  pausedSignal,
} from '@proj-airi/core-agent'

export interface VoiceEndJudgeOptions {
  /** Read at each pause. When it is false, the input ends only by the voice activity silence limit. */
  enabled: () => boolean
  /**
   * Reads the transcript of a paused input. A rejection counts as `incomplete`, so the silence limit ends the input.
   * `signal` aborts when the speaker continues or the input ends.
   */
  judge: (transcript: string, context: ConversationContext, signal: AbortSignal) => Promise<EndJudgement>
  /**
   * Silence after the last speech that starts a judgement. Shorter pauses are breaths between words.
   *
   * @default 1200
   */
  pauseMs?: number
}

/**
 * Ends a paused speech input early when a chat model reads its transcript as a complete message.
 *
 * The voice activity plugin ends an input after a long silence limit, so a speaker can stop to think and continue.
 * This plugin shortens the wait for a finished message:
 *
 * 1. The pause rule emits `paused` after `pauseMs` of silence that follows speech, with the input revisions of that moment.
 * 2. This plugin judges the paused transcript in the background and emits `end-judged` with those revisions.
 * 3. The end judgement rule seals the input when the result is `complete` and the revisions are still current.
 *
 * New speech aborts the running judgement, because its result can no longer be current. A failed judgement counts
 * as `incomplete`.
 *
 * Use when:
 * - Install it on a controller with the `input-control` grant, together with a voice activity plugin.
 *
 * Returns:
 * - A voice plugin named `voice-end-judge`.
 */
export function createVoiceEndJudgePlugin(options: VoiceEndJudgeOptions): VoicePlugin {
  return {
    name: 'voice-end-judge',
    setup(scope) {
      scope.rule(createPauseRule({ pauseMs: options.pauseMs ?? 1200 }))
      scope.rule(createEndJudgementRule())

      // The running judgement of each input. A newer pause, new speech, or the end of the input aborts it.
      const running = new Map<string, AbortController>()
      function abort(inputId: string, reason: string) {
        running.get(inputId)?.abort(reason)
        running.delete(inputId)
      }

      scope.on(pausedSignal, (paused) => {
        abort(paused.inputId, 'A newer pause replaced the judgement')
        if (!options.enabled())
          return

        const controller = new AbortController()
        running.set(paused.inputId, controller)
        const context = scope.conversationContext(paused.sessionId)
        void options.judge(paused.text, context, AbortSignal.any([controller.signal, scope.signal]))
          .catch((): EndJudgement => 'incomplete')
          .then((result) => {
            if (controller.signal.aborted)
              return
            running.delete(paused.inputId)
            // The judgement read this context, so a context change also makes it stale.
            scope.emit(endJudgedSignal, { inputId: paused.inputId, result, readAt: { ...paused.readAt, context: context.revision } })
          })
      })
      scope.on(inputActivitySignal, (activity) => {
        if (activity.speech)
          abort(activity.inputId, 'The speaker continued')
      })
      scope.on(inputFinalizingEvent, ({ inputId }) => abort(inputId, 'Speech input ended'))
      scope.on(inputSettledEvent, ({ inputId }) => abort(inputId, 'Speech input ended'))
      return undefined
    },
  }
}
