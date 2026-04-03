import { describe, expect, it } from 'vitest'

import { buildElectronLoopbackUrl, parseElectronCallbackQuery } from './electron-callback.shared'

describe('parseElectronCallbackQuery', () => {
  it('extracts the loopback port and original state from the OIDC callback query', () => {
    const result = parseElectronCallbackQuery(new URLSearchParams({
      code: 'sample-code',
      state: '43123:opaque-original-state',
    }))

    expect(result).toEqual({
      code: 'sample-code',
      port: '43123',
      relayUrl: 'http://127.0.0.1:43123/callback?code=sample-code&state=opaque-original-state',
      state: 'opaque-original-state',
      status: 'ready',
    })
  })

  it('returns an error state when the provider callback includes an explicit error', () => {
    const result = parseElectronCallbackQuery(new URLSearchParams({
      error: 'access_denied',
      error_description: 'The request was rejected.',
    }))

    expect(result).toEqual({
      message: 'The request was rejected.',
      status: 'error',
    })
  })

  it('returns an error state when the state parameter does not contain a loopback port', () => {
    const result = parseElectronCallbackQuery(new URLSearchParams({
      code: 'sample-code',
      state: 'opaque-original-state',
    }))

    expect(result).toEqual({
      message: 'Invalid state parameter',
      status: 'error',
    })
  })
})

describe('buildElectronLoopbackUrl', () => {
  it('encodes callback parameters into the localhost relay URL', () => {
    expect(buildElectronLoopbackUrl({
      code: 'code with spaces',
      port: '43123',
      state: 'state/with?chars',
    })).toBe('http://127.0.0.1:43123/callback?code=code%20with%20spaces&state=state%2Fwith%3Fchars')
  })
})
