import { defineStore } from 'pinia'
import { ref } from 'vue'

/** A motion that the LLM can name in the `motion` field of an ACT token. */
export interface StageMotionCatalogEntry {
  id: string
  description: string
}

/**
 * Motions that the mounted stage can play now.
 *
 * The stage writes the list when its model is ready, and clears it when it unmounts.
 * The runtime prompt reads it, so the LLM chooses only motions that exist.
 */
export const useStageMotionCatalogStore = defineStore('stage-motion-catalog', () => {
  const motions = ref<StageMotionCatalogEntry[]>([])

  function setMotions(entries: readonly StageMotionCatalogEntry[]) {
    motions.value = entries.map(entry => ({ id: entry.id, description: entry.description }))
  }

  function clear() {
    motions.value = []
  }

  return { motions, setMotions, clear }
})
