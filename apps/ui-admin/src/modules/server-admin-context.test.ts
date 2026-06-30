// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { ADMIN_API_ENVIRONMENTS, apiEnvironmentValueFor, buildApiServerSwitchUrl, defaultStandaloneApiServerUrl, getServerAdminBootstrapContext, resolveStandaloneServerAdminContext } from './server-admin-context'

describe('ui-admin bootstrap context', () => {
  it('uses the trusted API server origin carried by standalone server redirects', () => {
    expect(resolveStandaloneServerAdminContext(
      'https://admin.airi.build/users?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app%2Fapi%2Fadmin',
    )).toEqual({
      apiServerUrl: 'https://airi-server-dev.up.railway.app',
      currentUrl: 'https://admin.airi.build/users?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app%2Fapi%2Fadmin',
    })
  })

  it('ignores untrusted API server origins from crafted standalone admin URLs', () => {
    expect(resolveStandaloneServerAdminContext(
      'https://admin.airi.build/users?api_server_url=https%3A%2F%2Fevil.example',
    )).toBeNull()
  })

  it('allows localhost API origins for local development', () => {
    expect(resolveStandaloneServerAdminContext(
      'http://localhost:5173/admin/users?api_server_url=http%3A%2F%2F127.0.0.1%3A3000',
    )?.apiServerUrl).toBe('http://127.0.0.1:3000')
  })

  it('defaults local standalone dev UI origins to the local API port', () => {
    expect(defaultStandaloneApiServerUrl('http://localhost:5178')).toBe('http://localhost:3000')
    expect(defaultStandaloneApiServerUrl('http://127.0.0.1:5178')).toBe('http://127.0.0.1:3000')
  })

  it('keeps non-local standalone origins unchanged without redirect context', () => {
    expect(defaultStandaloneApiServerUrl('https://admin-preview.example')).toBe('https://admin-preview.example')
  })

  it('defaults known standalone admin deployments to their API origins', () => {
    expect(defaultStandaloneApiServerUrl('https://admin.airi.build')).toBe('https://api.airi.build')
    expect(defaultStandaloneApiServerUrl('https://server-dev.airi-server-admin.pages.dev')).toBe('https://airi-server-dev.up.railway.app')
  })

  it('exposes production, testing, and local API environment choices', () => {
    expect(ADMIN_API_ENVIRONMENTS.map(environment => environment.value)).toEqual([
      'https://api.airi.build',
      'https://airi-server-dev.up.railway.app',
      'http://localhost:3000',
    ])
  })

  it('maps custom localhost API origins to the local environment option', () => {
    expect(apiEnvironmentValueFor('http://127.0.0.1:8787')).toBe('http://localhost:3000')
  })

  it('builds a switched admin URL without dropping the current page state', () => {
    expect(buildApiServerSwitchUrl(
      'https://admin.airi.build/voice-packs/new?draft=1#advanced',
      'https://airi-server-dev.up.railway.app/api/admin',
    )).toBe('https://admin.airi.build/voice-packs/new?draft=1&api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app#advanced')
  })

  it('falls back to the standalone query context when the static placeholder script is still present', () => {
    document.body.innerHTML = '<script id="airi-server-admin-context" type="application/json">__AIRI_SERVER_ADMIN_CONTEXT__</script>'
    window.history.replaceState(
      null,
      '',
      '/admin/users?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app',
    )

    expect(getServerAdminBootstrapContext()?.apiServerUrl).toBe('https://airi-server-dev.up.railway.app')
  })
})
