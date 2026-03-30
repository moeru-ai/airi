import type { CreateJobResponse, GetJobResponse } from '@proj-airi/singing/types'

import type { SingingTrainingReportCard } from '../types/singing'

import { useSingingTrainingStore } from '../stores/modules/singing/training'
import { useSingingApi } from './use-singing-api'

const TRAINING_POLL_INTERVAL_MS = 3_000
const TRAINING_RETRY_INTERVAL_MS = 5_000

let trainingPollTimer: ReturnType<typeof setTimeout> | null = null
let trainingPollingJobId: string | null = null

function clearTrainingPollTimer() {
  if (trainingPollTimer) {
    clearTimeout(trainingPollTimer)
    trainingPollTimer = null
  }
}

export function useSingingTrainingRuntime() {
  const trainingStore = useSingingTrainingStore()
  const { singingFetch } = useSingingApi()

  function stopPolling() {
    clearTrainingPollTimer()
    trainingPollingJobId = null
  }

  function scheduleNextPoll(jobId: string, delayMs: number) {
    clearTrainingPollTimer()
    trainingPollingJobId = jobId
    trainingPollTimer = setTimeout(() => {
      void pollJob(jobId)
    }, delayMs)
  }

  async function fetchJob(jobId: string): Promise<GetJobResponse | null> {
    const response = await singingFetch(`/jobs/${jobId}`)
    if (response.status === 404) {
      trainingStore.reset()
      stopPolling()
      return null
    }

    if (!response.ok)
      throw new Error(`Failed to load training job ${jobId}: ${response.status}`)

    return await response.json() as GetJobResponse
  }

  async function fetchReportCard(voiceId: string): Promise<SingingTrainingReportCard | null> {
    const response = await singingFetch(`/models/${voiceId}/report`)
    if (!response.ok)
      return null

    return await response.json() as SingingTrainingReportCard
  }

  async function hydrateReportCard() {
    if (!trainingStore.voiceId)
      return

    const nextReportCard = await fetchReportCard(trainingStore.voiceId)
    if (!nextReportCard)
      return

    trainingStore.setReportCard(nextReportCard)

    if (trainingStore.reportCard)
      trainingStore.appendLog(`Quality grade: ${trainingStore.reportCard.overall_grade}`)
  }

  async function applyJobSnapshot(jobId: string, snapshot: GetJobResponse) {
    const { job } = snapshot
    const previousStepName = trainingStore.trainingStepName

    trainingStore.updateFromJob(job)

    if (job.trainingStepName && job.trainingStepName !== previousStepName) {
      const stageMessage = `[${job.trainingStep ?? 0}/${job.trainingStepTotal ?? 0}] ${job.trainingStepName}`
      trainingStore.appendLog(stageMessage)
    }

    if (job.status === 'completed') {
      trainingStore.markCompleted()
      trainingStore.appendLog('Training completed successfully!')
      await hydrateReportCard()
      stopPolling()
      return
    }

    if (job.status === 'failed') {
      trainingStore.markFailed(job.error ?? 'Unknown error')
      trainingStore.appendLog(`Error: ${job.error ?? 'Unknown error'}`)
      stopPolling()
      return
    }

    if (job.status === 'cancelled') {
      trainingStore.markCancelled(job.error ?? null)
      trainingStore.appendLog('Training cancelled.')
      stopPolling()
      return
    }

    scheduleNextPoll(jobId, TRAINING_POLL_INTERVAL_MS)
  }

  async function pollJob(jobId: string) {
    if (trainingStore.jobId !== jobId) {
      stopPolling()
      return
    }

    try {
      const snapshot = await fetchJob(jobId)
      if (!snapshot)
        return

      await applyJobSnapshot(jobId, snapshot)
    }
    catch {
      scheduleNextPoll(jobId, TRAINING_RETRY_INTERVAL_MS)
    }
  }

  function startPolling(jobId: string) {
    if (trainingPollingJobId === jobId && trainingPollTimer)
      return

    stopPolling()
    void pollJob(jobId)
  }

  async function startTrainingJob(input: {
    file: File
    voiceId: string
    epochs: number
    batchSize: number
  }): Promise<CreateJobResponse> {
    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('params', JSON.stringify({
      voiceId: input.voiceId,
      epochs: input.epochs,
      batchSize: input.batchSize,
    }))

    trainingStore.reset()
    trainingStore.appendLog(`Uploading dataset: ${input.file.name} (${formatFileSize(input.file.size)})...`)

    const response = await singingFetch('/train', {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null)
      const errorMessage = typeof errorPayload === 'object' && errorPayload
        ? String((errorPayload as Record<string, unknown>).message ?? (errorPayload as Record<string, unknown>).error ?? response.statusText)
        : response.statusText

      throw new Error(errorMessage || `Request failed: ${response.status}`)
    }

    const data = await response.json() as CreateJobResponse
    trainingStore.beginJob(data.jobId, input.voiceId, input.epochs)
    trainingStore.status = data.status
    trainingStore.appendLog(`Training job created: ${data.jobId}`)
    trainingStore.appendLog(`Voice ID: ${input.voiceId}`)
    trainingStore.appendLog(`Epochs: ${input.epochs}, Batch Size: ${input.batchSize}`)
    trainingStore.appendLog('Pipeline starting...')

    startPolling(data.jobId)
    return data
  }

  async function cancelActiveJob(): Promise<void> {
    const jobId = trainingStore.jobId
    if (!jobId)
      return

    const response = await singingFetch(`/jobs/${jobId}/cancel`, { method: 'POST' })
    if (!response.ok)
      throw new Error(`Failed to cancel training job ${jobId}: ${response.status}`)

    stopPolling()
    trainingStore.markCancelled()
    trainingStore.appendLog('Cancellation requested by user.')
  }

  async function resumeActiveJob(): Promise<void> {
    const jobId = trainingStore.jobId
    if (!jobId)
      return

    if (trainingStore.isBusy) {
      startPolling(jobId)
      return
    }

    if (trainingStore.isCompleted && !trainingStore.reportCard) {
      await hydrateReportCard()
      return
    }

    if (!trainingStore.isTerminal) {
      const snapshot = await fetchJob(jobId)
      if (snapshot)
        await applyJobSnapshot(jobId, snapshot)
    }
  }

  return {
    startTrainingJob,
    cancelActiveJob,
    resumeActiveJob,
    stopPolling,
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024)
    return `${bytes} B`
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
