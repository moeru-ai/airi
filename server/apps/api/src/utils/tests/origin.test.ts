import { describe, expect, it } from 'vitest'

import { resolveCheckoutRedirectBase } from '../origin'

const fallback = 'https://airi.moeru.ai'

function checkoutRequest(headers: Record<string, string>) {
  return new Request('http://localhost/api/v1/stripe/checkout', { method: 'POST', headers })
}

describe('resolveCheckoutRedirectBase', () => {
  it.each([
    'http://localhost:5173',
    'https://localhost:5273',
    'https://127.0.0.1:5273',
    'https://accounts.airi.build',
    'https://server-dev.airi-server-auth.pages.dev',
    'https://preview.moeru-ai.workers.dev',
  ])('returns the trusted web origin %s', (origin) => {
    expect(resolveCheckoutRedirectBase(checkoutRequest({ origin }), [], fallback)).toBe(origin)
  })

  it('prefers a trusted referer origin over the Origin header', () => {
    const request = checkoutRequest({
      referer: 'http://localhost:5173/settings/flux',
      origin: 'https://example.com',
    })

    expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe('http://localhost:5173')
  })

  it('uses the Origin header when the referer origin is not trusted', () => {
    const request = checkoutRequest({
      referer: 'https://example.com/page',
      origin: 'http://localhost:5173',
    })

    expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe('http://localhost:5173')
  })

  it('returns a private LAN dev origin only when ADDITIONAL_TRUSTED_ORIGINS lists it', () => {
    const request = checkoutRequest({ origin: 'https://10.0.0.129:5273' })

    expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe(fallback)
    expect(resolveCheckoutRedirectBase(request, ['https://10.0.0.129:5273'], fallback)).toBe('https://10.0.0.129:5273')
  })

  // A native app origin is not a page that a browser can open after Stripe.
  // See server/docs/ai/adr/2026-11-07-cross-origin-boundary.md.
  it.each([
    'capacitor://localhost',
    'https://localhost',
    'ai.moeru.airi-pocket://links',
  ])('falls back to the web app URL for the stage-pocket origin %s', (origin) => {
    expect(resolveCheckoutRedirectBase(checkoutRequest({ origin }), [], fallback)).toBe(fallback)
  })

  it('falls back to the web app URL for a stage-pocket referer', () => {
    const request = checkoutRequest({ referer: 'https://localhost/settings/flux' })

    expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe(fallback)
  })

  // ROOT CAUSE:
  //
  // Packaged Electron loads from file://, so checkout sends no Referer and an opaque or absent Origin.
  // The route threw INVALID_ORIGIN and desktop FLUX purchases failed.
  //
  // We fixed this by falling back to the configured web app URL.
  it('falls back to the web app URL when the request has no trusted origin (Electron file://)', () => {
    expect(resolveCheckoutRedirectBase(checkoutRequest({ origin: 'null' }), [], fallback)).toBe(fallback)
    expect(resolveCheckoutRedirectBase(checkoutRequest({}), [], fallback)).toBe(fallback)
  })

  it.each([
    'https://evil.example.com',
    // A raw `Origin` header comes from the client, so it can carry a path that ends with a trusted host suffix.
    'https://evil.example/x.moeru-ai.workers.dev',
  ])('falls back to the web app URL for the untrusted origin %s', (origin) => {
    expect(resolveCheckoutRedirectBase(checkoutRequest({ origin }), [], fallback)).toBe(fallback)
  })
})
