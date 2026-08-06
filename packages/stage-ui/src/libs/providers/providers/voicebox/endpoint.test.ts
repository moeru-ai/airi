import { describe, expect, it } from 'vitest'

import { resolveVoiceboxEndpoint } from './endpoint'

describe('voicebox endpoint', () => {
  it('routes a local development request through the Vite proxy', () => {
    expect(String(resolveVoiceboxEndpoint('http://127.0.0.1:17493/', '/generate/stream', true, new URL('http://127.0.0.1:5173'))))
      .toBe('http://127.0.0.1:5173/__voicebox/generate/stream')
  })
  it('keeps the configured production endpoint', () => {
    expect(String(resolveVoiceboxEndpoint('http://127.0.0.1:17493/', '/transcribe', false, new URL('http://127.0.0.1:5173'))))
      .toBe('http://127.0.0.1:17493/transcribe')
  })
  it('does not proxy a remote configured endpoint', () => {
    expect(String(resolveVoiceboxEndpoint('https://example.com/', '/health', true, new URL('http://127.0.0.1:5173'))))
      .toBe('https://example.com/health')
  })
})
