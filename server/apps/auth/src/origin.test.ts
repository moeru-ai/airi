import { describe, expect, it } from 'vitest'

import { getTrustedOrigin } from './origin'

describe('getTrustedOrigin', () => {
  it.each([
    'http://localhost:5173',
    'https://localhost',
    'http://127.0.0.1:43123',
    'https://preview.moeru-ai.workers.dev',
  ])('trusts %s by the built-in rules', (origin) => {
    expect(getTrustedOrigin(origin)).toBe(origin)
  })

  it.each([
    // A raw `Origin` header comes from the client, so it can carry a path that ends with the trusted suffix.
    'https://evil.example/x.moeru-ai.workers.dev',
    'https://evil.example?x=.moeru-ai.workers.dev',
    'http://preview.moeru-ai.workers.dev',
    'https://preview.moeru-ai.workers.dev:8443',
    'https://localhost.evil.example',
    'http://localhost:5173/callback',
    'ftp://localhost',
    'not an origin',
  ])('does not trust %s', (origin) => {
    expect(getTrustedOrigin(origin)).toBe('')
  })

  it('trusts an origin from the additional list', () => {
    expect(getTrustedOrigin('https://10.0.0.2:5273', ['https://10.0.0.2:5273'])).toBe('https://10.0.0.2:5273')
  })
})
