import { describe, expect, it } from 'vitest'

import { reportAppLocation, reportedLocation } from './reported-location'

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

describe('reportAppLocation', () => {
  it('removes the directory of a desktop page from every page property', () => {
    const properties: Record<string, unknown> = {
      $current_url: 'file:///home/user/app/out/renderer/index.html#/settings/providers?id=private',
      $pathname: '/home/user/app/out/renderer/index.html',
      $host: '',
      $referrer: '$direct',
      $session_entry_url: 'file:///home/user/app/out/renderer/index.html#/chat',
      $session_entry_pathname: '/home/user/app/out/renderer/index.html',
      $prev_pageview_pathname: '/home/user/app/out/renderer/index.html',
      plan: 'pro',
      base_url: 'http://localhost:11434/v1',
    }

    reportAppLocation(properties, 'https://desktop.example.com')

    expect(properties).toEqual({
      $current_url: 'https://desktop.example.com/settings/providers',
      $pathname: '/settings/providers',
      $host: 'desktop.example.com',
      $referrer: '$direct',
      $session_entry_url: 'https://desktop.example.com/chat',
      $session_entry_pathname: '/chat',
      $prev_pageview_pathname: '/',
      plan: 'pro',
      base_url: 'http://localhost:11434/v1',
    })
    expect(JSON.stringify(properties)).not.toContain('/home/user')
  })

  it('reports a mobile page under the app origin', () => {
    const properties: Record<string, unknown> = { $current_url: 'capacitor://localhost/settings?code=private', $pathname: '/settings', $host: 'localhost' }

    reportAppLocation(properties, 'https://pocket.example.com')

    expect(properties).toEqual({ $current_url: 'https://pocket.example.com/settings', $pathname: '/settings', $host: 'pocket.example.com' })
  })
})
