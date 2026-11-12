import { describe, expect, it } from 'vitest'

import { reportedLocation } from './reported-location'

describe('reportedLocation', () => {
  it('keeps the origin and path of a web page, without the query and the hash', () => {
    expect(reportedLocation('https://example.com/auth/callback?code=private#fragment')).toBe('https://example.com/auth/callback')
    expect(reportedLocation('/settings?tab=1')).toBe('/settings')
    expect(reportedLocation('')).toBe('')
  })

  it('gives the hash route of a desktop page under the app origin, without the directory of the file', () => {
    expect(reportedLocation('file:///home/user/app/out/renderer/index.html#/settings/providers?id=private', 'https://desktop.example.com')).toBe('https://desktop.example.com/settings/providers')
    expect(reportedLocation('file:///home/user/app/out/renderer/index.html', 'https://desktop.example.com')).toBe('https://desktop.example.com/')
    expect(reportedLocation('http://localhost:5173/#/settings', 'https://desktop.example.com')).toBe('https://desktop.example.com/settings')
  })

  it('gives the path of a mobile page under the app origin', () => {
    expect(reportedLocation('capacitor://localhost/settings/airi-card?code=private', 'https://pocket.example.com')).toBe('https://pocket.example.com/settings/airi-card')
    expect(reportedLocation('https://localhost/settings/airi-card#fragment', 'https://pocket.example.com')).toBe('https://pocket.example.com/settings/airi-card')
  })

  it('keeps a value that is not a URL', () => {
    expect(reportedLocation('settings?tab=1', 'https://desktop.example.com')).toBe('settings')
  })
})
