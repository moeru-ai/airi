// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { getServerAuthBootstrapContext, resolveStandaloneServerAuthContext } from './server-auth-context'

describe('ui-server-auth bootstrap context', () => {
  it('uses the trusted API server origin carried by standalone server redirects', () => {
    expect(resolveStandaloneServerAuthContext(
      'https://accounts.airi.build/ui/sign-in?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app%2Fapi%2Fauth&client_id=airi-stage-web',
      'https://api.airi.build',
    )).toEqual({
      apiServerUrl: 'https://airi-server-dev.up.railway.app',
      currentUrl: 'https://accounts.airi.build/ui/sign-in?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app%2Fapi%2Fauth&client_id=airi-stage-web',
    })
  })

  it('uses the trusted new Go backend origin carried by standalone server redirects', () => {
    const currentUrl = 'https://auth.airi.build/ui/sign-in?api_server_url=https%3A%2F%2Fairi-server-next.up.railway.app&client_id=airi-stage-pocket'

    expect(resolveStandaloneServerAuthContext(
      currentUrl,
      'https://api.airi.build',
    )).toEqual({
      apiServerUrl: 'https://airi-server-next.up.railway.app',
      currentUrl,
    })
  })

  it('ignores untrusted API server origins from crafted standalone auth URLs', () => {
    expect(resolveStandaloneServerAuthContext(
      'https://accounts.airi.build/ui/sign-in?api_server_url=https%3A%2F%2Fevil.example&client_id=airi-stage-web',
      'https://api.airi.build',
    )).toBeNull()
  })

  it('allows localhost API origins for local development', () => {
    expect(resolveStandaloneServerAuthContext(
      'http://localhost:5173/ui/sign-in?api_server_url=http%3A%2F%2F127.0.0.1%3A3000',
      'https://api.airi.build',
    )?.apiServerUrl).toBe('http://127.0.0.1:3000')
  })

  it('normalizes known production API hosts to HTTPS when typed with HTTP', () => {
    expect(resolveStandaloneServerAuthContext(
      'https://accounts.airi.build/ui/sign-in?api_server_url=http%3A%2F%2Fapi.airi.build',
      'http://localhost:3000',
    )?.apiServerUrl).toBe('https://api.airi.build')
  })

  it('falls back to the standalone query context when the static placeholder script is still present', () => {
    document.body.innerHTML = '<script id="airi-server-auth-context" type="application/json">__AIRI_SERVER_AUTH_CONTEXT__</script>'
    window.history.replaceState(
      null,
      '',
      '/ui/sign-in?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app',
    )

    expect(getServerAuthBootstrapContext()?.apiServerUrl).toBe('https://airi-server-dev.up.railway.app')
  })

  // ROOT CAUSE:
  //
  // This standalone auth UI is a client-side SPA: vue-router navigates from
  // /sign-in to /verify-email via pushState, changing window.location.href
  // without a page reload. getServerAuthBootstrapContext() used to cache its
  // result in a single module-level variable on first call, so every later
  // call on the same page load reused the FIRST visited route's resolved
  // apiServerUrl (or null) regardless of the current URL's query string.
  //
  // Concretely: a user lands on /sign-in with no api_server_url (context is
  // cached as null), signs up, and gets redirected to
  // /verify-email?api_server_url=http://localhost:3000 — but the stale cached
  // `null` is returned, so verify-email silently falls back to the production
  // SERVER_URL instead of the local dev server that created the account.
  //
  // Fixed by keying the cache on window.location.href so each SPA route
  // re-resolves its own context.
  it('re-resolves the bootstrap context after an in-page SPA navigation changes the URL', () => {
    document.body.innerHTML = ''
    window.history.replaceState(null, '', '/ui/sign-in')
    expect(getServerAuthBootstrapContext()).toBeNull()

    window.history.pushState(
      null,
      '',
      '/ui/verify-email?api_server_url=http%3A%2F%2Flocalhost%3A3000',
    )
    expect(getServerAuthBootstrapContext()?.apiServerUrl).toBe('http://localhost:3000')
  })
})
