import { describe, expect, it } from 'vitest'

import { assertApiPath, normalizeBaseUrl, readBody, resolveRequestUrl, toRequestError } from './request'

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

describe('assertApiPath', () => {
  it('accepts the paths the client builds', () => {
    expect(() => assertApiPath('/api/states')).not.toThrow()
    expect(() => assertApiPath('/api/states/light.living_room')).not.toThrow()
    expect(() => assertApiPath('/api/services/light/turn_on')).not.toThrow()
  })

  it('rejects a path outside the API', () => {
    expect(() => assertApiPath('/secrets.yaml')).toThrow('must start with /api/')
    expect(() => assertApiPath('/api')).toThrow('must start with /api/')
  })

  it('rejects a traversal', () => {
    expect(() => assertApiPath('/api/../secrets.yaml')).toThrow('must start with /api/')
    expect(() => assertApiPath('/api//secrets.yaml')).toThrow('must start with /api/')
  })

  it('rejects a percent escape, because the URL parser turns %2e into a dot', () => {
    // `/api/%2e%2e/secrets.yaml` reads as a path under /api/ and resolves to
    // /secrets.yaml. The client never escapes anything, so a % means an intruder.
    expect(() => assertApiPath('/api/%2e%2e/secrets.yaml')).toThrow('must start with /api/')
  })

  it('rejects whitespace, which could split the request line', () => {
    expect(() => assertApiPath('/api/states HTTP/1.1')).toThrow('must start with /api/')
    expect(() => assertApiPath('/api/states\nHost: evil')).toThrow('must start with /api/')
  })
})

describe('resolveRequestUrl', () => {
  it('joins the base URL and the path', () => {
    expect(resolveRequestUrl('http://homeassistant.local:8123', '/api/states').href)
      .toBe('http://homeassistant.local:8123/api/states')
  })

  it('keeps a base URL subpath, which a reverse proxy needs', () => {
    expect(resolveRequestUrl('https://example.com/ha', '/api/states').href)
      .toBe('https://example.com/ha/api/states')
  })

  it('rejects a path that would not sit under the base URL', () => {
    // The text check above already rejects this one. This case keeps the second
    // check honest, because the resolved path is the value the request uses.
    expect(() => resolveRequestUrl('https://example.com/ha', '/other/states')).toThrow()
    expect(resolveRequestUrl('https://example.com/ha', '/api/states').pathname).toBe('/ha/api/states')
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
