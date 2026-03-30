import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'

/**
 * [singing] Store for managing singing job artifacts (audio files).
 * Persisted so completed results remain visible after reopening the settings
 * window while the same renderer session is alive.
 */
export const useSingingArtifactsStore = defineStore('singing-artifacts', () => {
  const finalCoverUrl = useLocalStorage<string | null>('singing/artifacts/final-cover-url', null)
  const vocalsUrl = useLocalStorage<string | null>('singing/artifacts/vocals-url', null)
  const instrumentalUrl = useLocalStorage<string | null>('singing/artifacts/instrumental-url', null)
  const convertedVocalsUrl = useLocalStorage<string | null>('singing/artifacts/converted-vocals-url', null)

  function setArtifacts(nextArtifacts: {
    finalCoverUrl?: string | null
    vocalsUrl?: string | null
    instrumentalUrl?: string | null
    convertedVocalsUrl?: string | null
  }) {
    finalCoverUrl.value = nextArtifacts.finalCoverUrl ?? null
    vocalsUrl.value = nextArtifacts.vocalsUrl ?? null
    instrumentalUrl.value = nextArtifacts.instrumentalUrl ?? null
    convertedVocalsUrl.value = nextArtifacts.convertedVocalsUrl ?? null
  }

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
    setArtifacts,
    reset,
  }
})
