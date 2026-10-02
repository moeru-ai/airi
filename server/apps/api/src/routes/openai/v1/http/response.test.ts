import { describe, expect, it } from 'vitest'

import { buildSafeErrorResponseHeaders } from './response'

describe('buildSafeErrorResponseHeaders', () => {
  it('keeps the provider error content type and retry delay only', () => {
    const headers = buildSafeErrorResponseHeaders(new Response('provider error', {
      status: 429,
      headers: {
        'content-type': 'application/problem+json',
        'retry-after': '30',
        'set-cookie': 'provider-session=secret',
        'x-request-id': 'provider-request-id',
      },
    }))

    expect(headers.get('content-type')).toBe('application/problem+json')
    expect(headers.get('retry-after')).toBe('30')
    expect(headers.get('set-cookie')).toBeNull()
    expect(headers.get('x-request-id')).toBeNull()
  })
})
