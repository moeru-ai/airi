import { describe, expect, it } from 'vitest'

import {
  createBrowserRequestBlockedDiagnostics,
  listBrowserRequestBlockedCauses,
  redactSecretText,
  toModelConnectionError,
} from './errors'

describe('redactSecretText', () => {
  it('removes bearer tokens, api keys, and sk- prefixes', () => {
    expect(redactSecretText('Remote sent 401: Bearer sk-live-secret'))
      .toBe('Remote sent 401: Bearer [redacted]')
    expect(redactSecretText('x-api-key: abcdef'))
      .toBe('x-api-key: [redacted]')
    expect(redactSecretText('authorization=sk-proj-123'))
      .toBe('authorization=[redacted]')
    expect(redactSecretText('model sk-abc failed'))
      .toBe('model [redacted] failed')
  })
})

describe('abort classification', () => {
  it('does not label a user abort as a timeout', () => {
    const error = new Error('The operation was aborted.')
    error.name = 'AbortError'
    expect(toModelConnectionError(error, 'transport')).toMatchObject({
      code: 'unknown',
      message: 'The request was aborted.',
    })
  })

  it('labels a timeout abort as timeout', () => {
    const error = new Error('timeout')
    error.name = 'AbortError'
    expect(toModelConnectionError(error, 'transport')).toMatchObject({
      code: 'timeout',
      message: 'The request timed out.',
    })
  })

  it('maps node fetch failed to network-unreachable', () => {
    expect(toModelConnectionError(new TypeError('fetch failed'), 'transport')).toMatchObject({
      code: 'network-unreachable',
    })
  })
})

describe('browser-request-blocked diagnostics', () => {
  it('lists CORS, network, and TLS as possible causes', () => {
    expect(listBrowserRequestBlockedCauses()).toEqual(['cors', 'network', 'tls'])
    expect(createBrowserRequestBlockedDiagnostics()).toEqual({
      code: 'browser-request-blocked',
      possibleCauses: ['cors', 'network', 'tls'],
      nextSteps: [
        'Check that the upstream service allows browser CORS.',
        'Check the network path and DNS.',
        'Check the TLS certificate.',
        'Use the Electron desktop app when the browser cannot reach the service.',
      ],
    })
  })
})
