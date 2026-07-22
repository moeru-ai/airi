import type { MorphController } from './morph'

import { ref } from 'vue'

const BLINK_DURATION = 0.2 // seconds for one open→close→open cycle
const MIN_BLINK_INTERVAL = 1
const MAX_BLINK_INTERVAL = 6

function nextInterval() {
  return Math.random() * (MAX_BLINK_INTERVAL - MIN_BLINK_INTERVAL) + MIN_BLINK_INTERVAL
}

/**
 * Procedural eye blinking via the model's blink morph.
 *
 * Identical timing model to the VRM renderer's `useBlink`: a randomized
 * 1–6 s interval between blinks and a 0.2 s sine-shaped close/open so the lid
 * motion is smooth rather than a hard on/off.
 */
export function useMMDBlink() {
  const isBlinking = ref(false)
  const blinkProgress = ref(0)
  const timeSinceLastBlink = ref(0)
  const nextBlinkTime = ref(nextInterval())

  function update(morphs: MorphController | undefined, delta: number) {
    if (!morphs)
      return

    timeSinceLastBlink.value += delta

    if (!isBlinking.value && timeSinceLastBlink.value >= nextBlinkTime.value) {
      isBlinking.value = true
      blinkProgress.value = 0
    }

    if (!isBlinking.value)
      return

    blinkProgress.value += delta / BLINK_DURATION
    morphs.set('blink', Math.sin(Math.PI * blinkProgress.value))

    if (blinkProgress.value >= 1) {
      isBlinking.value = false
      timeSinceLastBlink.value = 0
      morphs.set('blink', 0)
      nextBlinkTime.value = nextInterval()
    }
  }

  return { update }
}
