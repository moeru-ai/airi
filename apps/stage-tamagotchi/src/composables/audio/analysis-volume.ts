import type { AudioAnalysisCallback } from '@proj-airi/audio/vue'

import { computed, readonly, ref } from 'vue'

export function useVolumeAnalysis() {
  const level = ref(0)
  const threshold = ref(25)
  const history = ref<number[]>([])
  const maxHistory = 100
  const isEnabled = ref(true)

  const isSpeaking = computed(() => level.value > threshold.value)

  const audioAnalysisCallback: AudioAnalysisCallback = (data) => {
    if (!isEnabled.value)
      return

    level.value = data.volumeLevel

    // Update history
    history.value.push(data.volumeLevel)
    if (history.value.length > maxHistory) {
      history.value.shift()
    }
  }

  function reset() {
    level.value = 0
    history.value = []
  }

  return {
    // State
    level: readonly(level),
    threshold,
    history: readonly(history),
    isSpeaking,
    isEnabled,

    // Controls
    reset,

    // For audio stream integration
    audioAnalysisCallback,
  }
}
