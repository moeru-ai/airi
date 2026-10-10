import { describe, expect, it } from 'vitest'

import { homeAssistantConfigRejections } from '../../../../shared/eventa/home-assistant'
import { assertAllowedRequest, normalizeBaseUrl, readBody, resolveConfigUpdate, resolveRequestUrl, toRequestError, toTokenPreview } from './request'

describe('normalizeBaseUrl', () => {
  it('trims the value and drops trailing slashes', () => {
    expect(normalizeBaseUrl('  http://homeassistant.local:8123/  ')).toBe('http://homeassistant.local:8123')
    expect(normalizeBaseUrl('http://homeassistant.local:8123///')).toBe('http://homeassistant.local:8123')
  })

  it('keeps an empty value empty, so the store can record "not configured"', () => {
    expect(normalizeBaseUrl('   ')).toBe('')
  })

  it('rejects a scheme this process cannot fetch', () => {
    expect(() => normalizeBaseUrl('file:///etc/passwd')).toThrow('must start with http:// or https://')
    expect(() => normalizeBaseUrl('ws://homeassistant.local:8123')).toThrow('must start with http:// or https://')
  })

  it('rejects a value that is not a URL', () => {
    expect(() => normalizeBaseUrl('homeassistant.local')).toThrow('is not a valid URL')
  })
})

describe('assertAllowedRequest', () => {
  it('accepts the three requests the client builds', () => {
    expect(() => assertAllowedRequest('GET', '/api/states')).not.toThrow()
    expect(() => assertAllowedRequest('GET', '/api/states/light.living_room')).not.toThrow()
    expect(() => assertAllowedRequest('POST', '/api/services/light/turn_on')).not.toThrow()
  })

  it('rejects a template, which would run arbitrary Jinja on the Home Assistant host', () => {
    // Measured: POST /api/template is reachable with the stored token, and the
    // client never builds this path.
    expect(() => assertAllowedRequest('POST', '/api/template')).toThrow('accepts only the requests')
    expect(() => assertAllowedRequest('GET', '/api/template')).toThrow('accepts only the requests')
  })

  it('rejects a state write, which shares a path with a safe read', () => {
    // GET reads one state. POST on the same path writes one, so a path-only
    // check is not enough.
    expect(() => assertAllowedRequest('POST', '/api/states/light.living_room')).toThrow('accepts only the requests')
    expect(() => assertAllowedRequest('POST', '/api/states')).toThrow('accepts only the requests')
    expect(() => assertAllowedRequest('DELETE', '/api/states/light.living_room')).toThrow('accepts only the requests')
  })

  it('rejects a method that does not match the shape', () => {
    expect(() => assertAllowedRequest('GET', '/api/services/light/turn_on')).toThrow('accepts only the requests')
    expect(() => assertAllowedRequest('PUT', '/api/states')).toThrow('accepts only the requests')
  })

  it('rejects a path outside the API, a traversal, and a doubled slash', () => {
    expect(() => assertAllowedRequest('GET', '/secrets.yaml')).toThrow('accepts only the requests')
    expect(() => assertAllowedRequest('GET', '/api/../secrets.yaml')).toThrow('accepts only the requests')
    expect(() => assertAllowedRequest('GET', '/api//states')).toThrow('accepts only the requests')
  })

  it('rejects a percent escape, because the URL parser turns %2e into a dot', () => {
    // `/api/%2e%2e/secrets.yaml` reads as a path under /api/ and resolves to
    // /secrets.yaml. The client never escapes anything, so a % means an intruder.
    expect(() => assertAllowedRequest('GET', '/api/%2e%2e/secrets.yaml')).toThrow('accepts only the requests')
  })

  it('rejects whitespace, which could split the request line', () => {
    expect(() => assertAllowedRequest('GET', '/api/states HTTP/1.1')).toThrow('accepts only the requests')
    expect(() => assertAllowedRequest('GET', '/api/states\nHost: evil')).toThrow('accepts only the requests')
  })

  it('rejects a segment that is not a Home Assistant slug', () => {
    expect(() => assertAllowedRequest('POST', '/api/services/light/Turn_On')).toThrow('accepts only the requests')
    expect(() => assertAllowedRequest('GET', '/api/states/light')).toThrow('accepts only the requests')
  })
})

describe('resolveConfigUpdate', () => {
  const stored = { baseUrl: 'http://homeassistant.local:8123', token: 'stored-token' }

  it('keeps the stored token when the address does not change', () => {
    expect(resolveConfigUpdate(stored, { baseUrl: stored.baseUrl })).toEqual(stored)
  })

  it('refuses to move the address while the stored token stays behind', () => {
    // This is the whole reason the rule exists. Without it, a renderer with code
    // execution points the address at a server it controls and the next request
    // sends the stored token there.
    expect(() => resolveConfigUpdate(stored, { baseUrl: 'https://attacker.example' }))
      .toThrow('The address changed. Enter the access token for the new address.')
  })

  it('accepts a new address together with a token for it', () => {
    expect(resolveConfigUpdate(stored, { baseUrl: 'https://other.example', token: 'new-token' }))
      .toEqual({ baseUrl: 'https://other.example', token: 'new-token' })
  })

  it('replaces the token without touching the address, so a rotation works', () => {
    expect(resolveConfigUpdate(stored, { baseUrl: stored.baseUrl, token: 'rotated' }))
      .toEqual({ baseUrl: stored.baseUrl, token: 'rotated' })
  })

  it('requires a token when none is stored', () => {
    expect(() => resolveConfigUpdate({ baseUrl: '', token: '' }, { baseUrl: 'http://homeassistant.local:8123' }))
      .toThrow('Enter a Home Assistant access token.')
  })

  it('clears both when the address is emptied', () => {
    expect(resolveConfigUpdate(stored, { baseUrl: '   ' })).toEqual({ baseUrl: '', token: '' })
  })

  it('clears the secret when the caller sends an empty token', () => {
    // The shared contract documents an empty token as the clear operation, and
    // an omitted token as the keep operation.
    expect(resolveConfigUpdate(stored, { baseUrl: stored.baseUrl, token: '' }))
      .toEqual({ baseUrl: stored.baseUrl, token: '' })
    expect(resolveConfigUpdate(stored, { baseUrl: stored.baseUrl, token: '  ' }))
      .toEqual({ baseUrl: stored.baseUrl, token: '' })
  })

  it('moves the address with the cleared secret, which leaks nothing', () => {
    expect(resolveConfigUpdate(stored, { baseUrl: 'https://other.example', token: '' }))
      .toEqual({ baseUrl: 'https://other.example', token: '' })
  })

  it('refuses with the message the shared contract documents', () => {
    // The renderer matches this message to show its own text, because only the
    // message of an error crosses the IPC boundary.
    expect(() => resolveConfigUpdate(stored, { baseUrl: 'https://other.example' }))
      .toThrow(homeAssistantConfigRejections.addressChanged)
    expect(() => resolveConfigUpdate({ baseUrl: '', token: '' }, { baseUrl: stored.baseUrl }))
      .toThrow(homeAssistantConfigRejections.tokenRequired)
  })

  it('normalizes the address it stores', () => {
    expect(resolveConfigUpdate({ baseUrl: '', token: '' }, { baseUrl: '  http://homeassistant.local:8123/  ', token: 't' }))
      .toEqual({ baseUrl: 'http://homeassistant.local:8123', token: 't' })
  })
})

describe('resolveRequestUrl', () => {
  it('joins the base URL and the path', () => {
    expect(resolveRequestUrl('http://homeassistant.local:8123', 'GET', '/api/states').href)
      .toBe('http://homeassistant.local:8123/api/states')
  })

  it('keeps a base URL subpath, which a reverse proxy needs', () => {
    expect(resolveRequestUrl('https://example.com/ha', 'GET', '/api/states').href)
      .toBe('https://example.com/ha/api/states')
  })

  it('checks the shape before it builds the URL', () => {
    expect(() => resolveRequestUrl('https://example.com/ha', 'POST', '/api/template')).toThrow('accepts only the requests')
  })

  it('confirms the resolved path sits under the base URL', () => {
    expect(resolveRequestUrl('https://example.com/ha', 'GET', '/api/states').pathname).toBe('/ha/api/states')
  })
})

describe('toTokenPreview', () => {
  it('keeps the last four characters so a user can tell which token is stored', () => {
    expect(toTokenPreview('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9abcd')).toBe('••••••••abcd')
  })

  it('reveals nothing when no token is stored', () => {
    expect(toTokenPreview('')).toBe('')
  })
})

describe('readBody', () => {
  it('parses JSON', async () => {
    expect(await readBody(new Response('[{"entity_id":"light.kitchen"}]'))).toEqual([{ entity_id: 'light.kitchen' }])
  })

  it('returns text when the body is not JSON', async () => {
    expect(await readBody(new Response('Not found'))).toBe('Not found')
  })

  it('returns undefined for an empty body', async () => {
    expect(await readBody(new Response(''))).toBeUndefined()
  })
})

describe('toRequestError', () => {
  it('names the token when Home Assistant rejects it', async () => {
    const error = await toRequestError(new Response(JSON.stringify({ message: 'Invalid auth' }), { status: 401 }))

    expect(error.message).toContain('rejected the access token (401)')
    expect(error.message).toContain('Invalid auth')
  })

  it('reports any other status with the status text', async () => {
    const error = await toRequestError(new Response('nope', { status: 500, statusText: 'Internal Server Error' }))

    expect(error.message).toContain('500 Internal Server Error')
    expect(error.message).toContain('nope')
  })
})
