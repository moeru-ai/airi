import type { VoiceActivityScore } from '@proj-airi/stage-ui/stores/voice'

import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { onScopeDispose, shallowRef } from 'vue'

/** A VAD score on the audio clock. */
export interface PlacedScore extends VoiceActivityScore {
  /** The end of the window, in milliseconds of audio since the observation started. */
  readonly audioMs: number
}

/**
 * Keeps the VAD scores of this window's listener for the last `keepMs` milliseconds of audio.
 *
 * Windows are placed by their audio duration, not by their arrival time. The detector can fall behind and then
 * score several windows at once, so arrival times bunch up.
 * The view updates once per animation frame, not once per window.
 * Only the listener of this window reports scores, so the list stays empty while another window listens.
 * Scope disposal stops the observation.
 */
export function useVadScores(keepMs: number) {
  const voice = useVoiceStore()
  const scores = shallowRef<readonly PlacedScore[]>([])
  let pending: PlacedScore[] = []
  let audioMs = 0
  let frame: number | undefined

  function flush() {
    frame = undefined
    const since = audioMs - keepMs
    scores.value = [...scores.value, ...pending].filter(score => score.audioMs > since)
    pending = []
  }

  const stop = voice.observeVadScores((score) => {
    audioMs += score.durationMs
    pending.push({ ...score, audioMs })
    frame ??= requestAnimationFrame(flush)
  })

  onScopeDispose(() => {
    stop()
    if (frame !== undefined)
      cancelAnimationFrame(frame)
  })

  return { scores }
}
