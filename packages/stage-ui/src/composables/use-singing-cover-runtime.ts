import type { CoverArtifacts, CreateJobResponse, GetJobResponse } from '@proj-airi/singing/types'

import type { SingingArtifactRef } from '../types/singing'

import { useSingingArtifactsStore } from '../stores/modules/singing/artifacts'
import { useSingingCoverStore } from '../stores/modules/singing/cover'
import { progressFromCoverStage } from '../types/singing'
import { useSingingApi } from './use-singing-api'

const COVER_POLL_INTERVAL_MS = 2_000
const COVER_RETRY_INTERVAL_MS = 5_000

let coverPollTimer: ReturnType<typeof setTimeout> | null = null
let coverPollingJobId: string | null = null

const FALLBACK_ARTIFACT_PATHS: Partial<Record<keyof CoverArtifacts, string>> = {
  vocals: '02_separate/vocals.wav',
  instrumental: '02_separate/instrumental.wav',
  convertedVocals: '04_convert/converted_vocals.wav',
  finalCover: '05_mix/final_cover.wav',
}

function clearCoverPollTimer() {
  if (coverPollTimer) {
    clearTimeout(coverPollTimer)
    coverPollTimer = null
  }
}

function buildArtifactUrl(
  apiUrl: (path: string) => string,
  jobId: string,
  artifact: SingingArtifactRef | null | undefined,
  fallbackPath?: string,
): string | null {
  const artifactPath = artifact?.path ?? fallbackPath
  if (!artifactPath)
    return null

  return apiUrl(`/artifacts/${jobId}/${artifactPath}`)
}

export function useSingingCoverRuntime() {
  const coverStore = useSingingCoverStore()
  const artifactsStore = useSingingArtifactsStore()
  const { apiUrl, singingFetch } = useSingingApi()

  function stopPolling() {
    clearCoverPollTimer()
    coverPollingJobId = null
  }

  function scheduleNextPoll(jobId: string, delayMs: number) {
    clearCoverPollTimer()
    coverPollingJobId = jobId
    coverPollTimer = setTimeout(() => {
      void pollJob(jobId)
    }, delayMs)
  }

  function hydrateArtifacts(jobId: string, artifacts?: Partial<CoverArtifacts>) {
    artifactsStore.setArtifacts({
      finalCoverUrl: buildArtifactUrl(apiUrl, jobId, artifacts?.finalCover, FALLBACK_ARTIFACT_PATHS.finalCover),
      vocalsUrl: buildArtifactUrl(apiUrl, jobId, artifacts?.vocals, FALLBACK_ARTIFACT_PATHS.vocals),
      instrumentalUrl: buildArtifactUrl(apiUrl, jobId, artifacts?.instrumental, FALLBACK_ARTIFACT_PATHS.instrumental),
      convertedVocalsUrl: buildArtifactUrl(apiUrl, jobId, artifacts?.convertedVocals, FALLBACK_ARTIFACT_PATHS.convertedVocals),
    })
  }

  async function fetchJob(jobId: string): Promise<GetJobResponse | null> {
    const response = await singingFetch(`/jobs/${jobId}`)
    if (response.status === 404) {
      coverStore.reset()
      artifactsStore.reset()
      stopPolling()
      return null
    }

    if (!response.ok)
      throw new Error(`Failed to load cover job ${jobId}: ${response.status}`)

    return await response.json() as GetJobResponse
  }

  async function applyJobSnapshot(jobId: string, snapshot: GetJobResponse) {
    const { job, artifacts } = snapshot

    coverStore.updateFromJob(job)

    const progressFromStage = progressFromCoverStage(job.currentStage ?? null)
    if (progressFromStage != null && !coverStore.isTerminal)
      coverStore.setProgress(progressFromStage)

    if (job.status === 'completed') {
      coverStore.markCompleted()
      hydrateArtifacts(jobId, artifacts)
      stopPolling()
      return
    }

    if (job.status === 'failed') {
      coverStore.markFailed(job.error ?? 'Unknown error')
      hydrateArtifacts(jobId, artifacts)
      stopPolling()
      return
    }

    if (job.status === 'cancelled') {
      coverStore.markCancelled(job.error ?? null)
      stopPolling()
      return
    }

    scheduleNextPoll(jobId, COVER_POLL_INTERVAL_MS)
  }

  async function pollJob(jobId: string) {
    if (coverStore.currentJobId !== jobId) {
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
      scheduleNextPoll(jobId, COVER_RETRY_INTERVAL_MS)
    }
  }

  function startPolling(jobId: string) {
    if (coverPollingJobId === jobId && coverPollTimer)
      return

    stopPolling()
    void pollJob(jobId)
  }

  async function startCoverJob(input: {
    file: File
    voiceId: string
    f0UpKey: number
    indexRate: number
    filterRadius: number
    protect: number
    rmsMixRate: number
    autoCalibrate: boolean
  }): Promise<CreateJobResponse> {
    const formData = new FormData()
    formData.append('file', input.file)
    formData.append('params', JSON.stringify({
      mode: 'rvc',
      separator: { backend: 'melband' },
      pitch: { backend: 'rmvpe' },
      converter: {
        backend: 'rvc',
        voiceId: input.voiceId,
        f0UpKey: input.f0UpKey,
        indexRate: input.indexRate,
        filterRadius: input.filterRadius,
        protect: input.protect,
        rmsMixRate: input.rmsMixRate,
      },
      autoCalibrate: input.autoCalibrate,
    }))

    artifactsStore.reset()
    coverStore.reset()

    const response = await singingFetch('/cover', {
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
    coverStore.beginJob(data.jobId, data.status)
    startPolling(data.jobId)
    return data
  }

  async function cancelActiveJob(): Promise<void> {
    const jobId = coverStore.currentJobId
    if (!jobId)
      return

    const response = await singingFetch(`/jobs/${jobId}/cancel`, { method: 'POST' })
    if (!response.ok)
      throw new Error(`Failed to cancel cover job ${jobId}: ${response.status}`)

    stopPolling()
    coverStore.markCancelled()
  }

  async function resumeActiveJob(): Promise<void> {
    const jobId = coverStore.currentJobId
    if (!jobId)
      return

    if (coverStore.isBusy) {
      startPolling(jobId)
      return
    }

    if (coverStore.isCompleted && !artifactsStore.finalCoverUrl) {
      const snapshot = await fetchJob(jobId)
      if (snapshot)
        await applyJobSnapshot(jobId, snapshot)
      return
    }

    if (!coverStore.isTerminal) {
      const snapshot = await fetchJob(jobId)
      if (snapshot)
        await applyJobSnapshot(jobId, snapshot)
    }
  }

  return {
    startCoverJob,
    cancelActiveJob,
    resumeActiveJob,
    stopPolling,
  }
}
