import type { SpeechInputAttemptOutcome } from '@proj-airi/core-agent'

import { errorMessageFrom, sleep } from '@moeru/std'
import { AudioInput } from '@proj-airi/pipelines-audio'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { listensContinuously, startsInputOnSpeech, useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings/audio-device'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { markRaw, onScopeDispose, ref, shallowRef, watch } from 'vue'

import { createReplaySource } from './replay-source'

/** Silence after the clip in which speech detection can still start an input from the end of the clip. */
const ONSET_TAIL_MS = 1000

/** Silence before a held input ends, so the last word is not cut, as when a person releases Push to Talk. */
const RELEASE_TAIL_MS = 300

/** The microphone keeps this much audio for the VAD pre-roll. The replay keeps the same. */
const HISTORY_MS = 360

/**
 * Replays a clip into the production voice pipeline in real time, in place of the microphone.
 *
 * The Hearing input mode decides how the clip starts an input:
 * - `always-on`: voice activity detection starts and ends inputs, as for the microphone.
 * - `push-to-talk` and `wake-word`: the replay holds an input for the clip, as a held Push to Talk key does.
 *   A wake word reads its own microphone input, so a replayed clip cannot wake.
 *
 * The microphone returns when every input that the clip started has settled, so a turn is not cancelled early.
 * A change of the microphone or the input mode, also from another window, changes how the voice host listens, so it
 * stops the replay. The replay keeps the input mode of its start.
 * Scope disposal stops a replay that is still running.
 */
export function useClipReplay() {
  const voice = useVoiceStore()
  const devices = useSettingsAudioDevice()
  const hearing = useHearingStore()
  const sessions = useChatSessionStore()

  const replaying = shallowRef<AbortController>()
  const error = ref<string>()

  async function replay(samples: Float32Array, sampleRate: number) {
    replaying.value?.abort()
    const run = new AbortController()
    replaying.value = run
    error.value = undefined

    const source = createReplaySource(samples, sampleRate)
    const settled: Promise<SpeechInputAttemptOutcome>[] = []
    const stopObserving = voice.controller.onInput(attempt => settled.push(attempt.done))
    const detectsSpeech = startsInputOnSpeech(hearing.inputMode)
    const stopped = new Promise<void>(resolve => run.signal.addEventListener('abort', () => resolve(), { once: true }))

    // The voice controller replaces its audio with each new microphone input, which ends the replay input.
    // The listening of the host follows the microphone switch and the input mode.
    const stopSettingsWatch = watch([() => devices.input, () => devices.enabled, () => hearing.inputMode], () => {
      error.value = 'A listening setting changed, so the replay stopped.'
      run.abort('Listening setting changed')
    }, { flush: 'sync' })

    try {
      // Replacing the audio cancels a microphone input that runs now. Its frames belong to the microphone.
      voice.controller.replaceAudio(markRaw(new AudioInput(source, { historyMs: HISTORY_MS })))

      if (detectsSpeech) {
        voice.startListening()
        await Promise.race([source.clipEnded, stopped])
        await Promise.race([sleep(ONSET_TAIL_MS), stopped])
      }
      else {
        const sessionId = sessions.activeSessionId
        if (!sessionId)
          throw new Error('Select a chat before you replay a clip.')
        const attempt = voice.beginManual(sessionId)
        // The input can settle before it reads the clip, for example without a transcription provider.
        const settledEarly = attempt.done.then((outcome) => {
          if (outcome.status === 'failed')
            throw new Error(`The input failed at the ${outcome.stage} stage: ${errorMessageFrom(outcome.error) ?? 'unknown error'}`)
          if (outcome.status === 'cancelled')
            throw new Error(`The input was cancelled: ${outcome.reason}`)
        })
        await Promise.race([source.clipEnded, stopped, settledEarly])
        await Promise.race([sleep(RELEASE_TAIL_MS), stopped, settledEarly])
        if (!run.signal.aborted)
          await Promise.race([attempt.end(), stopped])
        // The end can wait for speech recognition and the chat. A stopped replay drops its turn instead.
        if (run.signal.aborted)
          attempt.cancel('Replay stopped')
      }

      // An input can end and submit after the clip ends. The loop also waits for inputs that started while it waited.
      for (let count = 0; count < settled.length && !run.signal.aborted;) {
        count = settled.length
        await Promise.race([Promise.allSettled(settled), stopped])
      }
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'The replay failed.'
    }
    finally {
      stopSettingsWatch()
      stopObserving()
      voice.controller.replaceAudio(devices.input)
      if (detectsSpeech && (!devices.enabled || !listensContinuously(hearing.inputMode)))
        await voice.stopListening()
      if (replaying.value === run)
        replaying.value = undefined
    }
  }

  function stop() {
    replaying.value?.abort('Replay stopped')
  }

  onScopeDispose(stop)

  return { replaying, error, replay, stop }
}
