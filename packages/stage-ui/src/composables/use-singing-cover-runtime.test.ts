// @vitest-environment jsdom

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'

import { useSingingArtifactsStore } from '../stores/modules/singing/artifacts'
import { useSingingCoverStore } from '../stores/modules/singing/cover'
import { useSingingCoverRuntime } from './use-singing-cover-runtime'

function createJsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('useSingingCoverRuntime', () => {
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

  it('resumes a persisted cover job after store recreation and hydrates artifacts', async () => {
    const createdAt = '2026-03-30T00:00:00.000Z'
    const updatedAt = '2026-03-30T00:00:10.000Z'

    const initialCoverStore = useSingingCoverStore()
    initialCoverStore.beginJob('cover-job', 'running')
    await nextTick()

    // Simulate leaving the page and recreating a fresh Pinia graph.
    setActivePinia(createPinia())

    const fetchMock = vi.mocked(fetch)
    fetchMock.mockResolvedValueOnce(createJsonResponse({
      job: {
        id: 'cover-job',
        status: 'completed',
        currentStage: 'finalize',
        createdAt,
        updatedAt,
      },
      artifacts: {
        finalCover: { path: '05_mix/final_cover.wav', mimeType: 'audio/wav' },
        vocals: { path: '02_separate/vocals.wav', mimeType: 'audio/wav' },
        instrumental: { path: '02_separate/instrumental.wav', mimeType: 'audio/wav' },
        convertedVocals: { path: '04_convert/converted_vocals.wav', mimeType: 'audio/wav' },
      },
    }))

    const runtime = useSingingCoverRuntime()
    await runtime.resumeActiveJob()

    const coverStore = useSingingCoverStore()
    const artifactsStore = useSingingArtifactsStore()

    await vi.waitFor(() => {
      expect(coverStore.status).toBe('completed')
    })

    expect(coverStore.currentJobId).toBe('cover-job')
    expect(coverStore.progress).toBe(100)
    expect(artifactsStore.finalCoverUrl).toBe('https://api.airi.build/api/v1/singing/artifacts/cover-job/05_mix/final_cover.wav')
    expect(artifactsStore.vocalsUrl).toBe('https://api.airi.build/api/v1/singing/artifacts/cover-job/02_separate/vocals.wav')
    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.airi.build/api/v1/singing/jobs/cover-job',
      expect.objectContaining({ credentials: 'include' }),
    )
  })

  it('keeps polling after a transient non-2xx job response', async () => {
    vi.useFakeTimers()

    const coverStore = useSingingCoverStore()
    coverStore.beginJob('cover-job', 'running')

    const fetchMock = vi.mocked(fetch)
    fetchMock
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(createJsonResponse({
        job: {
          id: 'cover-job',
          status: 'completed',
          createdAt: '2026-03-30T00:00:00.000Z',
          updatedAt: '2026-03-30T00:00:10.000Z',
        },
      }))

    const runtime = useSingingCoverRuntime()
    await runtime.resumeActiveJob()
    await vi.advanceTimersByTimeAsync(5_000)

    await vi.waitFor(() => {
      expect(coverStore.status).toBe('completed')
    })
  })
})
