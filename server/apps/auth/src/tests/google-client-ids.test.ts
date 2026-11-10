import { google } from 'better-auth/social-providers'
import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { googleClientIds, GoogleNativeClientIdsSchema } from '../google-client-ids'

const nativeId = '123456789-native.apps.googleusercontent.com'

describe('native Google audiences', () => {
  it('preserves the existing browser config when no native clients are configured', () => {
    expect(googleClientIds('existing-browser-client')).toBe('existing-browser-client')
  })

  it('keeps the original browser ID first and adds only explicit audiences', () => {
    const clients = parse(GoogleNativeClientIdsSchema, ` ${nativeId}, ${nativeId}, `)
    expect(googleClientIds('existing-browser-client', clients)).toEqual(['existing-browser-client', nativeId])
  })

  // https://github.com/moeru-ai/airi/pull/2518#discussion_r3986076852
  // ROOT CAUSE:
  // The required dash rejected legacy Google client IDs during environment parsing.
  // An optional suffix accepts both forms without changing the audience hostname.
  it('accepts legacy Google client IDs alongside modern audiences', () => {
    const legacyId = '123456789.apps.googleusercontent.com'
    const clients = parse(GoogleNativeClientIdsSchema, ` ${legacyId}, ${nativeId}, ${legacyId} `)
    expect(googleClientIds('browser-client', clients)).toEqual(['browser-client', legacyId, nativeId])
  })

  it('keeps browser authorization on the original client when native audiences are enabled', async () => {
    const provider = google({
      clientId: googleClientIds('browser-client', [nativeId]),
      clientSecret: 'browser-secret',
    })
    const url = await provider.createAuthorizationURL({
      state: 'state',
      codeVerifier: 'test-code-verifier-with-at-least-forty-three-characters',
      redirectURI: 'https://example.com/api/auth/callback/google',
    })
    expect(url.searchParams.get('client_id')).toBe('browser-client')
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.com/api/auth/callback/google')
  })

  it('does not duplicate a browser client also used by native apps', () => {
    expect(googleClientIds(nativeId, [nativeId])).toEqual([nativeId])
  })

  it('treats an empty optional list as the original browser configuration', () => {
    expect(googleClientIds('browser', parse(GoogleNativeClientIdsSchema, ' , '))).toBe('browser')
  })

  it.each([
    '*',
    'https://example.com',
    '123-abc.apps.googleusercontent.com.evil.test',
    '123.apps.googleusercontent.com.evil.test',
    '123-.apps.googleusercontent.com',
    '*.apps.googleusercontent.com',
    'not-a-client',
  ])('rejects invalid audience %s', (value) => {
    expect(() => parse(GoogleNativeClientIdsSchema, value)).toThrow()
  })
})
