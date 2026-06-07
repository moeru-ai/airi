import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { filterTranscriptionByConfidence, useHearingStore } from './hearing'

// Stub vue-i18n so store setup (which transitively calls useI18n via
// useProvidersStore) runs without a real component instance, mirroring speech.test.ts.
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en-US' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

// generateTranscription is the network/provider path; stub it so transcription()
// resolves without a real provider fetch.
vi.mock('@xsai/generate-transcription', () => ({
  generateTranscription: vi.fn(async () => ({ text: 'hi' })),
}))

// useAnalytics() → useI18n(); spy on it to assert WHEN it is invoked.
const { useAnalyticsMock } = vi.hoisted(() => ({
  useAnalyticsMock: vi.fn(() => ({
    trackSttStarted: vi.fn(),
    trackSttSucceeded: vi.fn(),
    trackSttFailed: vi.fn(),
  })),
}))
vi.mock('../../composables/use-analytics', () => ({
  useAnalytics: useAnalyticsMock,
}))

describe('filterTranscriptionByConfidence', () => {
  const segments = [
    { text: 'Hello ', avg_logprob: -0.3 },
    { text: 'world ', avg_logprob: -1.2 },
    { text: 'gibberish', avg_logprob: -2.5 },
  ]

  it('keeps all segments when threshold is very low', () => {
    expect(filterTranscriptionByConfidence(segments, -3)).toBe('Hello world gibberish')
  })

  it('filters out low-confidence segments', () => {
    expect(filterTranscriptionByConfidence(segments, -1)).toBe('Hello')
  })

  it('filters out all segments when threshold is 0', () => {
    expect(filterTranscriptionByConfidence(segments, 0)).toBe('')
  })

  it('returns empty string for empty segments', () => {
    expect(filterTranscriptionByConfidence([], -1)).toBe('')
  })

  it('trims whitespace from result', () => {
    expect(filterTranscriptionByConfidence([{ text: '  hello  ', avg_logprob: -0.5 }], -1)).toBe('hello')
  })
})

describe('useHearingStore analytics resolution', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    useAnalyticsMock.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  // ROOT CAUSE:
  //
  // useAnalytics() calls useI18n(), which must run inside a setup/component
  // context. It was called lazily INSIDE transcription(); invoking transcription()
  // from a setTimeout / async callback (the STT test page does this) therefore ran
  // useI18n() with no active component instance and threw:
  //   "Must be called at the top of a `setup` function"
  //
  // We fixed this by resolving the analytics trackers once at store setup (the same
  // scope where useProvidersStore() already calls useI18n) and reusing them, so
  // transcription() never invokes a setup-only composable.
  it('resolves analytics at store setup, not on each transcription() call (Issue: "Must be called at the top of a setup function")', async () => {
    const store = useHearingStore()
    // useAnalytics() is invoked exactly once, during store setup.
    expect(useAnalyticsMock).toHaveBeenCalledTimes(1)

    const provider = {
      transcription: () => ({
        baseURL: 'http://test/v1/',
        model: 'm',
        fetch: async () => new Response(),
      }),
    } as any

    const result = await store.transcription(
      'whisper-local',
      provider,
      'm',
      new File([new Uint8Array([1, 2])], 'a.wav'),
    )

    expect(result.text).toBe('hi')
    // transcription() must NOT re-invoke the setup-only composable.
    expect(useAnalyticsMock).toHaveBeenCalledTimes(1)
  })
})
