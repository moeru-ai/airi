import type { JobStatus, SingingJob } from '@proj-airi/singing/types'

import { useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

/**
 * [singing] Store for managing cover job state in the UI.
 * The tracked job metadata is persisted so polling can resume after navigation
 * or reopening the settings window.
 */
export const useSingingCoverStore = defineStore('singing-cover', () => {
  const currentJobId = useLocalStorage<string | null>('singing/cover/job-id', null)
  const status = useLocalStorage<JobStatus | 'idle'>('singing/cover/status', 'idle')
  const currentStage = useLocalStorage<string | null>('singing/cover/current-stage', null)
  const progress = useLocalStorage('singing/cover/progress', 0)
  const error = useLocalStorage<string | null>('singing/cover/error', null)
  const startedAt = useLocalStorage<number | null>('singing/cover/started-at', null)
  const updatedAt = useLocalStorage<number | null>('singing/cover/updated-at', null)
  const retryCount = useLocalStorage('singing/cover/retry-count', 0)

  const isRunning = computed(() => status.value === 'running')
  const isBusy = computed(() => status.value === 'pending' || status.value === 'running')
  const isCompleted = computed(() => status.value === 'completed')
  const isFailed = computed(() => status.value === 'failed')
  const isCancelled = computed(() => status.value === 'cancelled')
  const isTerminal = computed(() => isCompleted.value || isFailed.value || isCancelled.value)
  const canCancel = computed(() => isBusy.value && !!currentJobId.value)

  function beginJob(jobId: string, nextStatus: JobStatus = 'pending') {
    const now = Date.now()
    currentJobId.value = jobId
    status.value = nextStatus
    currentStage.value = null
    progress.value = 0
    error.value = null
    retryCount.value = 0
    startedAt.value = now
    updatedAt.value = now
  }

  function updateFromJob(job: Pick<SingingJob, 'status' | 'currentStage' | 'error' | 'createdAt' | 'updatedAt' | 'retryCount'>) {
    status.value = job.status
    currentStage.value = job.currentStage ?? null
    error.value = job.error ?? null
    retryCount.value = job.retryCount ?? retryCount.value

    if (job.createdAt) {
      const parsedCreatedAt = Date.parse(job.createdAt)
      if (!Number.isNaN(parsedCreatedAt))
        startedAt.value = parsedCreatedAt
    }

    if (job.updatedAt) {
      const parsedUpdatedAt = Date.parse(job.updatedAt)
      if (!Number.isNaN(parsedUpdatedAt))
        updatedAt.value = parsedUpdatedAt
    }
  }

  function setProgress(nextProgress: number) {
    progress.value = Math.max(0, Math.min(100, Math.round(nextProgress)))
  }

  function markCompleted() {
    status.value = 'completed'
    progress.value = 100
    error.value = null
    currentStage.value = 'finalize'
    updatedAt.value = Date.now()
  }

  function markFailed(message: string) {
    status.value = 'failed'
    error.value = message
    updatedAt.value = Date.now()
  }

  function markCancelled(message?: string | null) {
    status.value = 'cancelled'
    error.value = message ?? null
    updatedAt.value = Date.now()
  }

  function clearTrackedJob() {
    currentJobId.value = null
    status.value = 'idle'
    currentStage.value = null
    progress.value = 0
    error.value = null
    startedAt.value = null
    updatedAt.value = null
    retryCount.value = 0
  }

  function reset() {
    clearTrackedJob()
  }

  return {
    currentJobId,
    status,
    currentStage,
    progress,
    error,
    startedAt,
    updatedAt,
    retryCount,
    isRunning,
    isBusy,
    isCompleted,
    isFailed,
    isCancelled,
    isTerminal,
    canCancel,
    beginJob,
    updateFromJob,
    setProgress,
    markCompleted,
    markFailed,
    markCancelled,
    clearTrackedJob,
    reset,
  }
})
