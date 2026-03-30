import type { JobStatus, SingingJob } from '@proj-airi/singing/types'

import type { SingingTrainingReportCard } from '../../../types/singing'

import { StorageSerializers, useLocalStorage } from '@vueuse/core'
import { defineStore } from 'pinia'
import { computed } from 'vue'

import { normalizeSingingTrainingReportCard } from '../../../types/singing'

const MAX_PERSISTED_TRAINING_LOGS = 200

/**
 * [singing] Store for managing voice training job state.
 * The state is persisted so the UI can recover after navigation or reopening
 * the settings window while a background training job keeps running.
 */
export const useSingingTrainingStore = defineStore('singing-training', () => {
  const jobId = useLocalStorage<string | null>('singing/training/job-id', null)
  const voiceId = useLocalStorage<string>('singing/training/voice-id', '')
  const status = useLocalStorage<JobStatus | 'idle'>('singing/training/status', 'idle')
  const currentEpoch = useLocalStorage('singing/training/current-epoch', 0)
  const totalEpochs = useLocalStorage('singing/training/total-epochs', 0)
  const error = useLocalStorage<string | null>('singing/training/error', null)

  const trainingPct = useLocalStorage('singing/training/progress-pct', 0)
  const trainingStep = useLocalStorage('singing/training/step', 0)
  const trainingStepTotal = useLocalStorage('singing/training/step-total', 0)
  const trainingStepName = useLocalStorage('singing/training/step-name', '')
  const lossG = useLocalStorage<number | null>('singing/training/loss-g', null)
  const lossD = useLocalStorage<number | null>('singing/training/loss-d', null)
  const startedAt = useLocalStorage<number | null>('singing/training/started-at', null)
  const updatedAt = useLocalStorage<number | null>('singing/training/updated-at', null)
  const logs = useLocalStorage<string[]>('singing/training/logs', [])
  const persistedReportCard = useLocalStorage<SingingTrainingReportCard | Record<string, unknown> | null>(
    'singing/training/report-card',
    null,
    { serializer: StorageSerializers.object },
  )

  persistedReportCard.value = normalizeSingingTrainingReportCard(persistedReportCard.value)

  const reportCard = computed<SingingTrainingReportCard | null>({
    get: () => normalizeSingingTrainingReportCard(persistedReportCard.value),
    set: (nextReportCard) => {
      persistedReportCard.value = normalizeSingingTrainingReportCard(nextReportCard)
    },
  })

  const progress = computed(() => {
    if (trainingPct.value > 0)
      return trainingPct.value
    if (totalEpochs.value === 0)
      return 0
    return Math.round((currentEpoch.value / totalEpochs.value) * 100)
  })

  const isGanTraining = computed(() => trainingStepName.value === 'GAN fine-tuning')
  const isTraining = computed(() => status.value === 'running')
  const isBusy = computed(() => status.value === 'pending' || status.value === 'running')
  const isCompleted = computed(() => status.value === 'completed')
  const isFailed = computed(() => status.value === 'failed')
  const isCancelled = computed(() => status.value === 'cancelled')
  const isTerminal = computed(() => isCompleted.value || isFailed.value || isCancelled.value)
  const canCancel = computed(() => isBusy.value && !!jobId.value)

  function beginJob(jobIdentifier: string, nextVoiceId: string, epochs = 0) {
    const now = Date.now()
    jobId.value = jobIdentifier
    voiceId.value = nextVoiceId
    status.value = 'pending'
    currentEpoch.value = 0
    totalEpochs.value = epochs
    error.value = null
    trainingPct.value = 0
    trainingStep.value = 0
    trainingStepTotal.value = 0
    trainingStepName.value = ''
    lossG.value = null
    lossD.value = null
    startedAt.value = now
    updatedAt.value = now
    logs.value = []
    reportCard.value = null
  }

  function updateFromJob(job: Pick<
    SingingJob,
    | 'status'
    | 'error'
    | 'currentEpoch'
    | 'totalEpochs'
    | 'trainingPct'
    | 'trainingStep'
    | 'trainingStepTotal'
    | 'trainingStepName'
    | 'lossG'
    | 'lossD'
    | 'createdAt'
    | 'updatedAt'
  >) {
    status.value = job.status
    error.value = job.error ?? null
    currentEpoch.value = job.currentEpoch ?? currentEpoch.value
    totalEpochs.value = job.totalEpochs ?? totalEpochs.value
    trainingPct.value = job.trainingPct ?? trainingPct.value
    trainingStep.value = job.trainingStep ?? trainingStep.value
    trainingStepTotal.value = job.trainingStepTotal ?? trainingStepTotal.value
    trainingStepName.value = job.trainingStepName ?? trainingStepName.value
    lossG.value = job.lossG ?? lossG.value
    lossD.value = job.lossD ?? lossD.value

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

  function appendLog(line: string) {
    if (!line)
      return

    const nextLogs = logs.value.at(-1) === line
      ? logs.value
      : [...logs.value, line].slice(-MAX_PERSISTED_TRAINING_LOGS)

    logs.value = nextLogs
  }

  function setReportCard(nextReportCard: SingingTrainingReportCard | null) {
    reportCard.value = nextReportCard
  }

  function markCompleted() {
    status.value = 'completed'
    trainingPct.value = 100
    currentEpoch.value = totalEpochs.value
    error.value = null
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
    jobId.value = null
    voiceId.value = ''
    status.value = 'idle'
    currentEpoch.value = 0
    totalEpochs.value = 0
    error.value = null
    trainingPct.value = 0
    trainingStep.value = 0
    trainingStepTotal.value = 0
    trainingStepName.value = ''
    lossG.value = null
    lossD.value = null
    startedAt.value = null
    updatedAt.value = null
    logs.value = []
    reportCard.value = null
  }

  function reset() {
    clearTrackedJob()
  }

  return {
    jobId,
    voiceId,
    status,
    currentEpoch,
    totalEpochs,
    progress,
    error,
    isTraining,
    isBusy,
    isGanTraining,
    isCompleted,
    isFailed,
    isCancelled,
    isTerminal,
    canCancel,
    trainingPct,
    trainingStep,
    trainingStepTotal,
    trainingStepName,
    lossG,
    lossD,
    startedAt,
    updatedAt,
    logs,
    reportCard,
    beginJob,
    updateFromJob,
    appendLog,
    setReportCard,
    markCompleted,
    markFailed,
    markCancelled,
    clearTrackedJob,
    reset,
  }
})
