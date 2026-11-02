import type { TurnRef, VoicePlugin } from '@proj-airi/core-agent'
import type { AudioRange, AudioWindow } from '@proj-airi/pipelines-audio'

import { createSpeechActivityRule, inputActivitySignal, speechActivitySignal } from '@proj-airi/core-agent'

/** Application policy chooses the destination. The model only supplies scores for ordered windows. */
export interface VoiceActivityOptions {
  readonly detect: (window: AudioWindow, signal: AbortSignal) => Promise<number>
  readonly target: () => { sessionId: string, interruptTurns: readonly TurnRef[] } | undefined
  /**
   * External KWS adapters resolve pronunciation ownership and the character session before returning a wake signal.
   * `activity` is the VAD result of the same window, before an active input lowers the threshold. An adapter that
   * reads another input uses it to find pauses.
   */
  readonly detectWakeWord?: (window: AudioWindow, signal: AbortSignal, activity: { speech: boolean, durationMs: number }) => Promise<{ sessionId: string, interruptTurns: readonly TurnRef[] } | undefined>
  /** Echo rejection runs after detection. Detectors remain active while the assistant speaks. */
  readonly acceptSpeech?: (window: AudioWindow, signal: AbortSignal) => Promise<boolean>
  readonly enabled?: () => boolean
  /**
   * Receives the VAD result of each window that the plugin noted on its input, in window order.
   * The voice host traces speech segments with it, and speaker recognition counts only speech with it.
   * It never changes how the input starts or ends.
   */
  readonly onActivity?: (activity: { inputId: string, range: AudioRange, speech: boolean, durationMs: number }) => void
  /** @default 0.6. A live input uses 30 percent of this score to keep speech active. */
  readonly threshold?: number
  /** @default 300. Shorter speech is discarded when silence ends an input. */
  readonly minSpeechMs?: number
  /**
   * This much silence ends an accepted input. A function is read on each window, so a setting change applies at once.
   *
   * @default 1200
   */
  readonly silenceMs?: number | (() => number)
  /** @default 360. Speech onset retains this much audio before the detected window. */
  readonly preRollMs?: number
}

/**
 * Measures voice activity and lets the speech activity rule decide.
 *
 * The plugin runs the VAD model, the wake word adapter, and the echo gate on each window, then emits one
 * `speech-activity` signal. The rule from `createSpeechActivityRule` begins, seals, and cancels inputs from these
 * signals. The begun input carries its cause, `speech` or `wake-word`, in `SpeechInputAttempt.cause`.
 * It owns no recorder, source, transcription request, or playback nodes.
 */
export function createVoiceActivityPlugin(options: VoiceActivityOptions): VoicePlugin {
  // The observer keeps the pre-roll of setup time. The threshold and the silence limit are read on each window.
  const preRollMs = options.preRollMs ?? 360

  return { name: 'voice-activity', setup(scope) {
    // The rule receives the options object itself. A spread would read the getters of a live setting only once.
    scope.rule(createSpeechActivityRule(options))
    scope.on(inputActivitySignal, activity => options.onActivity?.(activity))

    // NOTICE:
    // SileroVad requires 512 samples at 16 kHz, so each window lasts 32 ms.
    // The constraint is in workers/vad/silero-vad.ts.
    // Remove this fixed size when detectors supply their own window requirements.
    scope.input.observe({ windowMs: 32, hopMs: 32, scheduling: 'ordered', preRollMs }, async (ctx) => {
      const { window } = ctx
      const score = await options.detect(window, ctx.signal)
      const durationMs = (window.range.endFrame - window.range.startFrame) * 1000 / window.sampleRate
      const threshold = options.threshold ?? 0.6
      const wake = await options.detectWakeWord?.(window, ctx.signal, { speech: score >= threshold, durationMs })
      ctx.signal.throwIfAborted()

      // The echo gate can cost a model call, so it runs only for a window that can begin an input.
      const active = ctx.controls.activeInput()
      const canBegin = (wake && wake.sessionId !== active?.sessionId) || (!active && score >= threshold)
      const accepted = canBegin ? (options.acceptSpeech ? await options.acceptSpeech(window, ctx.signal) : true) : undefined
      ctx.signal.throwIfAborted()

      scope.emit(speechActivitySignal, {
        range: window.range,
        durationMs,
        score,
        discontinuity: window.discontinuity,
        ...(accepted === undefined ? {} : { accepted }),
        ...(wake ? { wake } : {}),
      })
    })

    return undefined
  } }
}
