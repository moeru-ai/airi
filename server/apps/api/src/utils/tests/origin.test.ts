import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { describe, expect, it } from 'vitest'

import { getTrustedCorsOrigin, getTrustedOrigin, resolveCheckoutRedirectBase, resolveTrustedRequestOrigin } from '../origin'

describe('origin utils', () => {
  it('allows localhost origins', () => {
    expect(getTrustedOrigin('http://localhost:5173')).toBe('http://localhost:5173')
  })

  it('allows https localhost (mkcert dev)', () => {
    expect(getTrustedOrigin('https://localhost:5273')).toBe('https://localhost:5273')
    expect(getTrustedOrigin('https://127.0.0.1:5273')).toBe('https://127.0.0.1:5273')
  })

  it('allows the standalone auth UI origins', () => {
    expect(getTrustedOrigin('https://accounts.airi.build')).toBe('https://accounts.airi.build')
    expect(getTrustedOrigin('https://server-dev.airi-server-auth.pages.dev')).toBe('https://server-dev.airi-server-auth.pages.dev')
  })

  it('rejects retired management UI origins', () => {
    expect(getTrustedOrigin('https://admin.airi.build')).toBe('')
    expect(getTrustedOrigin('https://server-dev.airi-server-admin.pages.dev')).toBe('')
  })

  it('rejects private LAN Vite dev origins unless listed in ADDITIONAL_TRUSTED_ORIGINS', () => {
    expect(getTrustedOrigin('https://10.0.0.129:5273')).toBe('')
    expect(getTrustedOrigin('https://198.18.0.1:5273')).toBe('')
    expect(getTrustedOrigin('https://192.168.1.5:5273')).toBe('')

    const extra = ['https://10.0.0.129:5273', 'https://198.18.0.1:5273', 'https://192.168.1.5:5273']
    expect(getTrustedOrigin('https://10.0.0.129:5273', extra)).toBe('https://10.0.0.129:5273')
    expect(getTrustedOrigin('https://198.18.0.1:5273', extra)).toBe('https://198.18.0.1:5273')
    expect(getTrustedOrigin('https://192.168.1.5:5273', extra)).toBe('https://192.168.1.5:5273')
  })

  it('rejects untrusted origins', () => {
    expect(getTrustedOrigin('https://example.com')).toBe('')
  })

  it('allows the opaque origin only for official transcription CORS', () => {
    expect(getTrustedCorsOrigin('null', '/api/v1/audio/transcriptions/stream')).toBe('null')
    expect(getTrustedCorsOrigin('null', '/api/v1/chats')).toBe('')
    expect(getTrustedOrigin('null')).toBe('')
  })

  it('reflects the opaque origin on the transcription preflight only', async () => {
    const app = new Hono()
      .use('/api/*', cors({
        origin: (origin, c) => getTrustedCorsOrigin(origin, c.req.path),
        credentials: true,
      }))
      .post('/api/v1/audio/transcriptions/stream', c => c.text('ok'))
      .post('/api/v1/chats', c => c.text('ok'))

    const headers = {
      'Origin': 'null',
      'Access-Control-Request-Headers': 'authorization,content-type',
      'Access-Control-Request-Method': 'POST',
    }
    const transcriptionPreflight = await app.request('/api/v1/audio/transcriptions/stream', {
      method: 'OPTIONS',
      headers,
    })
    const unrelatedPreflight = await app.request('/api/v1/chats', {
      method: 'OPTIONS',
      headers,
    })

    expect(transcriptionPreflight.status).toBe(204)
    expect(transcriptionPreflight.headers.get('Access-Control-Allow-Origin')).toBe('null')
    expect(transcriptionPreflight.headers.get('Access-Control-Allow-Credentials')).toBe('true')
    expect(unrelatedPreflight.headers.get('Access-Control-Allow-Origin')).toBeNull()
  })

  it('prefers a trusted referer origin', () => {
    const request = new Request('http://localhost/api/v1/stripe/checkout', {
      headers: {
        referer: 'https://airi.moeru.ai/settings/flux',
        origin: 'https://example.com',
      },
    })

    expect(resolveTrustedRequestOrigin(request)).toBe('https://airi.moeru.ai')
  })

  it('falls back to a trusted origin header when referer is missing', () => {
    const request = new Request('http://localhost/api/v1/stripe/checkout', {
      headers: {
        origin: 'http://localhost:5173',
      },
    })

    expect(resolveTrustedRequestOrigin(request)).toBe('http://localhost:5173')
  })

  describe('resolveCheckoutRedirectBase', () => {
    const fallback = 'https://airi.moeru.ai'

    it('prefers the trusted request origin over the fallback', () => {
      const request = new Request('http://localhost/api/v1/stripe/checkout', {
        headers: { referer: 'http://localhost:5173/settings/flux' },
      })

      expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe('http://localhost:5173')
    })

    // ROOT CAUSE:
    //
    // The packaged Electron renderer loads from file://, so its Stripe checkout
    // request carries no Referer and an opaque/absent Origin. resolveTrustedRequestOrigin
    // then returns undefined and the checkout route threw
    // `createBadRequestError('Missing trusted request origin', 'INVALID_ORIGIN')`,
    // blocking FLUX purchases on desktop (web/mobile were unaffected because they
    // send a trusted web origin).
    //
    // Before patch: no trusted origin -> undefined -> route throws INVALID_ORIGIN.
    // After patch: no trusted origin -> falls back to the configured web app URL,
    // which Stripe accepts as a success_url/cancel_url base.
    it('falls back to the web app URL when the request has no trusted origin (Electron file://)', () => {
      const request = new Request('http://localhost/api/v1/stripe/checkout', {
        method: 'POST',
        // file:// renderers send no Referer; Origin is absent or the opaque literal "null".
        headers: { origin: 'null' },
      })

      expect(resolveTrustedRequestOrigin(request, [])).toBeUndefined()
      expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe(fallback)
    })

    it('falls back to the web app URL for an untrusted web origin', () => {
      const request = new Request('http://localhost/api/v1/stripe/checkout', {
        headers: { origin: 'https://evil.example.com' },
      })

      expect(resolveCheckoutRedirectBase(request, [], fallback)).toBe(fallback)
    })
  })
})
