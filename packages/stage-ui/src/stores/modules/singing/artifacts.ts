import { defineStore } from 'pinia'
import { ref } from 'vue'

/**
 * [singing] Store for managing singing job artifacts (audio files).
 */
export const useSingingArtifactsStore = defineStore('singing-artifacts', () => {
  /** URL to the final cover audio */
  const finalCoverUrl = ref<string | null>(null)
  /** URL to the separated vocals */
  const vocalsUrl = ref<string | null>(null)
  /** URL to the instrumental track */
  const instrumentalUrl = ref<string | null>(null)
  /** URL to the converted vocals (before remixing) */
  const convertedVocalsUrl = ref<string | null>(null)

  function reset() {
    finalCoverUrl.value = null
    vocalsUrl.value = null
    instrumentalUrl.value = null
    convertedVocalsUrl.value = null
  }

  return {
    finalCoverUrl,
    vocalsUrl,
    instrumentalUrl,
    convertedVocalsUrl,
    reset,
  }
})
