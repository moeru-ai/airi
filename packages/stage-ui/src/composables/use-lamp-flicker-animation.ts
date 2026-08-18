import type { MaybeRefOrGetter } from 'vue'

import { lampFlickerAnimationClass } from '@proj-airi/ui'
import { computed, ref, toValue, watch } from 'vue'

export { lampFlickerAnimationClass }

const LAMP_FLICKER_DELAY_VAR = '--lamp-flicker-delay'
const LAMP_FLICKER_DURATION_VAR = '--lamp-flicker-duration'

/**
 * Drives randomized keyframe timing for `.lamp-flicker-animation` from `@proj-airi/ui/main.css` while `flickerActive` is true.
 * Import `@proj-airi/ui/main.css` from the app global stylesheet (e.g. `styles/main.css`). When inactive, delay resets to 0s.
 */
export function useLampFlickerAnimation(flickerActive: MaybeRefOrGetter<boolean>) {
  const flickerDuration = ref('6.4s')
  const flickerDelay = ref('0s')

  function randomizeFlicker(resetPhase = false) {
    flickerDuration.value = `${(5.8 + Math.random() * 1.8).toFixed(2)}s`

    if (resetPhase) {
      flickerDelay.value = `${(-Math.random() * 5.4).toFixed(2)}s`
      return
    }

    flickerDelay.value = '0s'
  }

  function onAnimationIteration() {
    if (toValue(flickerActive)) {
      randomizeFlicker()
    }
  }

  watch(
    () => toValue(flickerActive),
    (active) => {
      if (!active) {
        flickerDelay.value = '0s'
        return
      }

      randomizeFlicker(true)
    },
    { immediate: true },
  )

  const flickerStyle = computed(() => {
    if (!toValue(flickerActive)) {
      return undefined
    }

    return {
      [LAMP_FLICKER_DELAY_VAR]: flickerDelay.value,
      [LAMP_FLICKER_DURATION_VAR]: flickerDuration.value,
    } as Record<string, string>
  })

  return {
    flickerStyle,
    onAnimationIteration,
  }
}
