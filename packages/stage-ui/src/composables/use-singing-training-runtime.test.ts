// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useSingingTrainingStore } from '../stores/modules/singing/training'
import { useSingingTrainingRuntime } from './use-singing-training-runtime'

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useSingingTrainingRuntime', () => {
  beforeEach(() => {
    localStorage.clear()
    setActivePinia(createPinia())
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('resumes a persisted training job after store recreation and loads the report card', async () => {
    const createdAt = '2026-03-30T00:00:00.000Z'
    const updatedAt = '2026-03-30T00:05:00.000Z'

    const initialTrainingStore = useSingingTrainingStore()
    initialTrainingStore.beginJob('training-job', 'voice-alpha', 200)
    initialTrainingStore.status = 'running'
    await nextTick()

    // Simulate leaving the page and restoring from localStorage.
    setActivePinia(createPinia())

    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(createJsonResponse({
        job: {
          id: 'training-job',
          status: 'completed',
          createdAt,
          updatedAt,
          currentEpoch: 200,
          totalEpochs: 200,
          trainingPct: 100,
        },
      }))
      .mockResolvedValueOnce(createJsonResponse({
        overall_grade: 'A',
        singer_similarity: 0.94,
        content_score: 0.91,
        f0_corr: 0.93,
        naturalness_mos: 4.3,
        f0_rmse_cents: 14,
        mcd: 4.9,
        worst_samples: [],
        per_bucket_scores: {},
      }))

    const runtime = useSingingTrainingRuntime()
    await runtime.resumeActiveJob()

    const trainingStore = useSingingTrainingStore()

    await vi.waitFor(() => {
      expect(trainingStore.status).toBe('completed')
      expect(trainingStore.reportCard?.overall_grade).toBe('A')
    })

    expect(trainingStore.jobId).toBe('training-job')
    expect(trainingStore.progress).toBe(100)
    expect(trainingStore.logs).toContain('Training completed successfully!')
    expect(trainingStore.logs).toContain('Quality grade: A')
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      'https://api.airi.build/api/v1/singing/jobs/training-job',
      expect.objectContaining({ credentials: 'include' }),
    )
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      'https://api.airi.build/api/v1/singing/models/voice-alpha/report',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('keeps polling after a transient non-2xx training job response', async () => {
    vi.useFakeTimers()

    const trainingStore = useSingingTrainingStore()
    trainingStore.beginJob('training-job', 'voice-alpha', 200)
    trainingStore.status = 'running'

    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(createJsonResponse({
        job: {
          id: 'training-job',
          status: 'completed',
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:05:00.000Z',
          currentEpoch: 200,
          totalEpochs: 200,
          trainingPct: 100,
        },
      }))
      .mockResolvedValueOnce(createJsonResponse({
        overall_grade: 'A',
        singer_similarity: 0.94,
        content_score: 0.91,
        f0_corr: 0.93,
        naturalness_mos: 4.3,
        f0_rmse_cents: 14,
        mcd: 4.9,
        worst_samples: [],
        per_bucket_scores: {},
      }))

    const runtime = useSingingTrainingRuntime()
    await runtime.resumeActiveJob()
    await vi.advanceTimersByTimeAsync(5_000)

    await vi.waitFor(() => {
      expect(trainingStore.status).toBe('completed')
      expect(trainingStore.reportCard?.overall_grade).toBe('A')
    })
  })
})
