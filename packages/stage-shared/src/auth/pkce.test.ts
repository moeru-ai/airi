import { describe, expect, it } from 'vitest'

import { base64UrlEncode, generateCodeChallenge, generateCodeVerifier, generateState } from './pkce'

describe('base64UrlEncode', () => {
  it('encodes to URL-safe base64 without padding', () => {
    const input = new Uint8Array([72, 101, 108, 108, 111]) // "Hello"
    const result = base64UrlEncode(input)
    expect(result).toBe('SGVsbG8')
    expect(result).not.toMatch(/[+/=]/)
  })

  it('replaces + with - and / with _', () => {
    const input = new Uint8Array([251, 255, 254])
    const result = base64UrlEncode(input)
    expect(result).not.toMatch(/[+/=]/)
  })
})

describe('generateCodeVerifier', () => {
  it('returns a URL-safe string of expected length range', () => {
    const verifier = generateCodeVerifier()
    expect(verifier.length).toBeGreaterThanOrEqual(43)
    expect(verifier.length).toBeLessThanOrEqual(128)
    expect(verifier).not.toMatch(/[+/=]/)
  })

  it('generates unique values', () => {
    const a = generateCodeVerifier()
    const b = generateCodeVerifier()
    expect(a).not.toBe(b)
  })
})

describe('generateCodeChallenge', () => {
  it('produces a valid S256 challenge from a known verifier', async () => {
    // RFC 7636 Appendix B test vector
    const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'
    const challenge = await generateCodeChallenge(verifier)
    expect(challenge).toBe('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM')
  })
})

describe('generateState', () => {
  it('returns a URL-safe string', () => {
    const state = generateState()
    expect(state.length).toBeGreaterThan(0)
    expect(state).not.toMatch(/[+/=]/)
  })

  it('generates unique values', () => {
    const a = generateState()
    const b = generateState()
    expect(a).not.toBe(b)
  })
})
