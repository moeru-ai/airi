import { describe, expect, it } from 'vitest'

import { reportedLocation } from './reported-location'

describe('reportedLocation', () => {
  it('keeps the origin and path of a web page, without the query and the hash', () => {
    expect(reportedLocation('https://example.com/auth/callback?code=private#fragment')).toBe('https://example.com/auth/callback')
    expect(reportedLocation('http://localhost:5173/#/settings')).toBe('http://localhost:5173/')
  })

  it('gives the hash route of a packaged desktop page, without the directory of the file', () => {
    expect(reportedLocation('file:///home/user/app/out/renderer/index.html#/settings/providers?id=private')).toBe('/settings/providers')
    expect(reportedLocation('file:///home/user/app/out/renderer/index.html')).toBe('/')
  })

  it('gives the path of a page that a mobile app serves from its own scheme', () => {
    expect(reportedLocation('capacitor://localhost/settings/airi-card?code=private')).toBe('/settings/airi-card')
    expect(reportedLocation('capacitor://localhost/')).toBe('/')
  })

  it('keeps a value that is not a URL', () => {
    expect(reportedLocation('')).toBe('')
    expect(reportedLocation('/settings?tab=1')).toBe('/settings')
  })
})
