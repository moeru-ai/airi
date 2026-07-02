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
})
