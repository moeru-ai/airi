import { describe, expect, it } from 'vitest'

import { resolveCrossOriginHeaders } from './cross-origin'

const UI_ORIGIN = 'https://accounts.airi.build'

describe('resolveCrossOriginHeaders', () => {
  describe('bearer policy', () => {
    it.each([
      'https://airi.moeru.ai',
      'null',
      'capacitor://localhost',
      'https://localhost',
      'http://localhost:5173',
    ])('answers a preflight from %s with the wildcard', (origin) => {
      const result = resolveCrossOriginHeaders({
        method: 'OPTIONS',
        origin,
        requestMethod: 'POST',
        requestHeaders: 'authorization, content-type',
      })

      expect(result.preflight).toBe(true)
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*')
      expect(result.headers['Access-Control-Allow-Credentials']).toBeUndefined()
    })

    it('sends the wildcard to a request without an Origin header', () => {
      const result = resolveCrossOriginHeaders({ method: 'GET' })

      expect(result.preflight).toBe(false)
      expect(result.headers).toEqual({ 'Access-Control-Allow-Origin': '*' })
    })

    it('does not vary an actual response, because every origin gets the same headers', () => {
      const result = resolveCrossOriginHeaders({ method: 'GET', origin: 'https://airi.moeru.ai' })

      expect(result.headers.Vary).toBeUndefined()
    })
  })

  describe('credentialed origin', () => {
    it('gives the configured UI origin its own origin and credentials', () => {
      const result = resolveCrossOriginHeaders({ method: 'POST', origin: UI_ORIGIN, credentialedOrigin: UI_ORIGIN })

      expect(result.headers['Access-Control-Allow-Origin']).toBe(UI_ORIGIN)
      expect(result.headers['Access-Control-Allow-Credentials']).toBe('true')
      expect(result.headers.Vary).toBe('Origin')
    })

    it('gives credentials to a preflight from the configured UI origin', () => {
      const result = resolveCrossOriginHeaders({
        method: 'OPTIONS',
        origin: UI_ORIGIN,
        requestMethod: 'POST',
        credentialedOrigin: UI_ORIGIN,
      })

      expect(result.preflight).toBe(true)
      expect(result.headers['Access-Control-Allow-Origin']).toBe(UI_ORIGIN)
      expect(result.headers['Access-Control-Allow-Credentials']).toBe('true')
    })

    it.each([
      'https://airi.moeru.ai',
      'https://evil.example',
      'null',
    ])('gives %s the wildcard and no credentials', (origin) => {
      const result = resolveCrossOriginHeaders({ method: 'POST', origin, credentialedOrigin: UI_ORIGIN })

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*')
      expect(result.headers['Access-Control-Allow-Credentials']).toBeUndefined()
      expect(result.headers.Vary).toBe('Origin')
    })

    it('varies a response without an Origin header, so a cache does not give it to the UI', () => {
      const result = resolveCrossOriginHeaders({ method: 'GET', credentialedOrigin: UI_ORIGIN })

      expect(result.headers['Access-Control-Allow-Origin']).toBe('*')
      expect(result.headers.Vary).toBe('Origin')
    })
  })

  describe('preflight', () => {
    it('reflects the requested headers and allows every route method for two hours', () => {
      const result = resolveCrossOriginHeaders({
        method: 'OPTIONS',
        origin: 'https://airi.moeru.ai',
        requestMethod: 'PUT',
        requestHeaders: 'authorization, x-airi-chat-session-id',
      })

      expect(result.headers['Access-Control-Allow-Headers']).toBe('authorization, x-airi-chat-session-id')
      expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS')
      expect(result.headers['Access-Control-Max-Age']).toBe('7200')
      expect(result.headers.Vary).toBe('Access-Control-Request-Headers')
    })

    it('omits Allow-Headers when the preflight requests no headers', () => {
      const result = resolveCrossOriginHeaders({ method: 'OPTIONS', requestMethod: 'GET' })

      expect(result.preflight).toBe(true)
      expect(result.headers['Access-Control-Allow-Headers']).toBeUndefined()
    })

    it('omits Allow-Headers when Access-Control-Request-Headers is empty', () => {
      const result = resolveCrossOriginHeaders({ method: 'OPTIONS', requestMethod: 'GET', requestHeaders: '' })

      expect(result.preflight).toBe(true)
      expect(result.headers['Access-Control-Allow-Headers']).toBeUndefined()
    })

    it('varies by both request headers when the service has a credentialed origin', () => {
      const result = resolveCrossOriginHeaders({
        method: 'OPTIONS',
        origin: 'https://airi.moeru.ai',
        requestMethod: 'POST',
        credentialedOrigin: UI_ORIGIN,
      })

      expect(result.headers.Vary).toBe('Origin, Access-Control-Request-Headers')
    })

    it('treats an OPTIONS request without Access-Control-Request-Method as an actual request', () => {
      const result = resolveCrossOriginHeaders({ method: 'OPTIONS', origin: 'https://airi.moeru.ai' })

      expect(result.preflight).toBe(false)
      expect(result.headers['Access-Control-Allow-Methods']).toBeUndefined()
      expect(result.headers.Vary).toBeUndefined()
    })
  })

  describe('expose headers', () => {
    it('lists the exposed headers on an actual response', () => {
      const result = resolveCrossOriginHeaders({ method: 'GET', exposeHeaders: ['Retry-After', 'ETag'] })

      expect(result.headers['Access-Control-Expose-Headers']).toBe('Retry-After, ETag')
    })

    it('omits Expose-Headers when the list is empty', () => {
      const result = resolveCrossOriginHeaders({ method: 'GET', exposeHeaders: [] })

      expect(result.headers['Access-Control-Expose-Headers']).toBeUndefined()
    })

    it('omits Expose-Headers on a preflight, because a browser reads it only from the actual response', () => {
      const result = resolveCrossOriginHeaders({ method: 'OPTIONS', requestMethod: 'GET', exposeHeaders: ['Retry-After'] })

      expect(result.headers['Access-Control-Expose-Headers']).toBeUndefined()
    })
  })
})
