// @vitest-environment jsdom

import { describe, expect, it } from 'vitest'

import { getServerAdminBootstrapContext, resolveStandaloneServerAdminContext } from './server-admin-context'

describe('ui-admin bootstrap context', () => {
  it('uses the trusted API server origin carried by standalone server redirects', () => {
    expect(resolveStandaloneServerAdminContext(
      'https://admin.airi.build/admin/users?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app%2Fapi%2Fadmin',
    )).toEqual({
      apiServerUrl: 'https://airi-server-dev.up.railway.app',
      currentUrl: 'https://admin.airi.build/admin/users?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app%2Fapi%2Fadmin',
    })
  })

  it('ignores untrusted API server origins from crafted standalone admin URLs', () => {
    expect(resolveStandaloneServerAdminContext(
      'https://admin.airi.build/admin/users?api_server_url=https%3A%2F%2Fevil.example',
    )).toBeNull()
  })

  it('allows localhost API origins for local development', () => {
    expect(resolveStandaloneServerAdminContext(
      'http://localhost:5173/admin/users?api_server_url=http%3A%2F%2F127.0.0.1%3A3000',
    )?.apiServerUrl).toBe('http://127.0.0.1:3000')
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
