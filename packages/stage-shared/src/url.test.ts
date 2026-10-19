import { describe, expect, it } from 'vitest'

import { isWebUrl } from './url'

describe('isWebUrl', () => {
  it.each([
    'https://example.com/report',
    'http://localhost:5173/',
    'HTTPS://EXAMPLE.COM',
  ])('accepts the web URL %s', (url) => {
    expect(isWebUrl(url)).toBe(true)
  })

  it.each([
    'javascript:alert(1)',
    'data:text/html,hi',
    'file:///etc/passwd',
    // A prefix check accepted these, but they have no host.
    'http://',
    'https://',
    'not a url',
  ])('rejects %s', (url) => {
    expect(isWebUrl(url)).toBe(false)
  })
})
