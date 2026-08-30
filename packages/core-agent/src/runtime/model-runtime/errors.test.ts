import { describe, expect, it } from 'vitest'

import {
  createBrowserRequestBlockedDiagnostics,
  listBrowserRequestBlockedCauses,
  redactSecretText,
  secretValuesFromHeaders,
  toModelConnectionError,
} from './errors'

describe('redactSecretText', () => {
  it('removes labeled bearer tokens and api keys', () => {
    expect(redactSecretText('Remote sent 401: Bearer gateway-token'))
      .toBe('Remote sent 401: Bearer [redacted]')
    expect(redactSecretText('x-api-key: abcdef'))
      .toBe('x-api-key: [redacted]')
    expect(redactSecretText('authorization=local-token'))
      .toBe('authorization=[redacted]')
  })

  it('does not treat sk- model ids as secrets unless they are configured', () => {
    // ROOT CAUSE:
    //
    // Keys are arbitrary strings (DEC-08). A blanket sk-* pattern treated
    // OpenAI-style tokens as canonical secrets and redacted model IDs.
    // https://github.com/moeru-ai/airi/pull/2411
    expect(redactSecretText('model sk-abc failed'))
      .toBe('model sk-abc failed')
    expect(redactSecretText('model sk-abc failed', ['sk-abc']))
      .toBe('model [redacted] failed')
  })

  it('redacts API key phrases and configured secret header values (PR #2411)', () => {
    // ROOT CAUSE:
    //
    // Pattern-only redaction missed "API key: abc123" because api[_-]?key
    // does not match a space, and it never substituted configured header
    // values such as X-Token.
    // https://github.com/moeru-ai/airi/pull/2411
    expect(redactSecretText('Remote sent 401: API key: abc123'))
      .toBe('Remote sent 401: API key: [redacted]')
    expect(redactSecretText('gateway echoed X-Token: secret-header', ['secret-header']))
      .toBe('gateway echoed X-Token: [redacted]')
    expect(redactSecretText('gateway echoed X-Token: secret-header', ['secret-header']))
      .not.toContain('secret-header')
  })

  it('redacts a configured secret of any length', () => {
    expect(redactSecretText('rejected ab', ['ab']))
      .toBe('rejected [redacted]')
    expect(redactSecretText('rejected hello world token', ['hello world token']))
      .toBe('rejected [redacted]')
  })
})

describe('secretValuesFromHeaders', () => {
  it('collects bearer tokens and secret header values of any length', () => {
    expect(secretValuesFromHeaders({
      authorization: 'Bearer ab',
      'X-Token': 'xy',
      accept: 'application/json',
    })).toEqual(['Bearer ab', 'ab', 'xy'])
  })
})

describe('request failures', () => {
  it('maps a 401 request failure to unauthorized and redacts the configured key', () => {
    const error = Object.assign(new Error('Incorrect API key provided: local-gateway-token'), {
      status: 401,
    })
    const mapped = toModelConnectionError(error, 'generation', ['local-gateway-token'])
    expect(mapped.code).toBe('unauthorized')
    expect(mapped.status).toBe(401)
    expect(mapped.message).not.toContain('local-gateway-token')
    expect(mapped.message).toContain('[redacted]')
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
