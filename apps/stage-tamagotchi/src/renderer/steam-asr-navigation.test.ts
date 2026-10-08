import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolveSteamAsrRedirect } from './steam-asr-navigation'

describe('steam ASR settings navigation', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('redirects old ASR settings and unavailable configured instances in Steam', () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    const hasProvider = (id: string) => id === 'sherpaw-transcription'
    expect(resolveSteamAsrRedirect('/settings/providers/transcription/browser-web-speech-api', hasProvider)).toBe('/settings/modules/hearing')
    expect(resolveSteamAsrRedirect('/v2/settings/providers/edit/old-cloud-instance', hasProvider)).toBe('/v2/settings/providers')
    expect(resolveSteamAsrRedirect('/v2/settings/providers/edit/sherpaw-transcription', hasProvider)).toBeUndefined()
    expect(resolveSteamAsrRedirect('/settings/modules/hearing', hasProvider)).toBeUndefined()
  })

  it.each(['/settings/modules/artistry', '/settings/modules/web-search', '/settings/modules/messaging-discord', '/settings/modules/x'])('rejects disabled Steam module route %s', (path) => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    expect(resolveSteamAsrRedirect(path, () => true)).toBe('/settings/modules')
  })

  it('rejects blocked old speech routes', () => {
    vi.stubEnv('VITE_DISTRIBUTION', 'steam')
    expect(resolveSteamAsrRedirect('/settings/providers/speech/official-provider-speech-streaming', () => false)).toBe('/settings/providers')
  })

  it('preserves non-Steam settings URLs', () => {
    vi.stubEnv('VITE_DISTRIBUTION', '')
    expect(resolveSteamAsrRedirect('/settings/providers/transcription/browser-web-speech-api', () => false)).toBeUndefined()
    expect(resolveSteamAsrRedirect('/v2/settings/providers/edit/old-cloud-instance', () => false)).toBeUndefined()
  })
})
