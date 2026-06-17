import type { ProviderMetadata } from '../providers'

import { createPinia, setActivePinia } from 'pinia'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useProvidersStore } from '../providers'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    locale: { value: 'en-US' },
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}))

function fasterWhisperMetadata(): ProviderMetadata {
  const store = useProvidersStore()
  return store.providerMetadata['faster-whisper']
}

describe('faster-whisper provider validation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  // ROOT CAUSE:
  //
  // The validator's liveness probe treated every HTTP response (including
  // 401/403) as proof the server was reachable and therefore valid. A
  // reachable-but-unauthorized server was marked as configured, and the
  // user only discovered the bad/missing API key later when an actual
  // transcription request failed with the same 401/403.
  //
  // We fixed this by inspecting response.status after the probe and
  // returning valid: false for 401/403, while still treating other
  // statuses (200, 404, 405, ...) as a healthy liveness signal.
  it('rejects the config when the server returns 401 for the configured API key', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 401 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fasterWhisperMetadata().validators.validateProviderConfig({
      baseUrl: 'http://localhost:8000/v1/',
      apiKey: 'wrong-key',
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('401')
  })

  it('rejects the config when the server returns 403 for the configured API key', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 403 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fasterWhisperMetadata().validators.validateProviderConfig({
      baseUrl: 'http://localhost:8000/v1/',
      apiKey: 'wrong-key',
    })

    expect(result.valid).toBe(false)
    expect(result.reason).toContain('403')
  })

  it('still accepts 404 from transcriptions-only servers that do not implement /v1/models', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fasterWhisperMetadata().validators.validateProviderConfig({
      baseUrl: 'http://localhost:8000/v1/',
      apiKey: 'some-key',
    })

    expect(result.valid).toBe(true)
  })

  it('still accepts 405 from transcriptions-only servers that do not implement /v1/models', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 405 }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await fasterWhisperMetadata().validators.validateProviderConfig({
      baseUrl: 'http://localhost:8000/v1/',
      apiKey: 'some-key',
    })

    expect(result.valid).toBe(true)
  })

  it('sends the configured API key as a Bearer token on the probe request', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fasterWhisperMetadata().validators.validateProviderConfig({
      baseUrl: 'http://localhost:8000/v1/',
      apiKey: 'my-key',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer my-key' },
      }),
    )
  })

  it('falls back to the placeholder key on the probe request when no API key is configured', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    await fasterWhisperMetadata().validators.validateProviderConfig({
      baseUrl: 'http://localhost:8000/v1/',
      apiKey: '',
    })

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/v1/models',
      expect.objectContaining({
        headers: { Authorization: 'Bearer sk-faster-whisper' },
      }),
    )
  })
})
