import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

/**
 * [singing] Store for managing cover job state in the UI.
 */
export const useSingingCoverStore = defineStore('singing-cover', () => {
  /** Current job ID being tracked */
  const currentJobId = ref<string | null>(null)
  /** Current job status */
  const status = ref<string>('idle')
  /** Current pipeline stage */
  const currentStage = ref<string | null>(null)
  /** Progress percentage (0-100) */
  const progress = ref(0)
  /** Error message if job failed */
  const error = ref<string | null>(null)

  const isRunning = computed(() => status.value === 'running')
  const isCompleted = computed(() => status.value === 'completed')
  const isFailed = computed(() => status.value === 'failed')

  function reset() {
    currentJobId.value = null
    status.value = 'idle'
    currentStage.value = null
    progress.value = 0
    error.value = null
  }

  return {
    currentJobId,
    status,
    currentStage,
    progress,
    error,
    isRunning,
    isCompleted,
    isFailed,
    reset,
  }
})
