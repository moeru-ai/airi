import { describe, expect, it } from 'vitest'

import { buildAdminUiRedirectUrl, buildAdminUiUrl, resolveAdminUiUrl } from '../server-admin-ui'

describe('admin UI URL helpers', () => {
  it('builds admin UI URLs under the configured admin base path', () => {
    expect(buildAdminUiUrl('https://admin.airi.build', '/users', '?query=alice')).toBe(
      'https://admin.airi.build/users?query=alice',
    )
  })

  it('maps server /admin requests to the standalone admin UI while preserving queries', () => {
    expect(buildAdminUiRedirectUrl(
      'https://admin.airi.build/',
      'https://api.airi.build/admin/voice-packs?provider=openai',
    )).toBe('https://admin.airi.build/voice-packs?provider=openai')
  })

  it('adds the API server origin for standalone admin UI cross-environment redirects', () => {
    expect(buildAdminUiRedirectUrl(
      'https://admin-preview.example/',
      'https://airi-server-dev.up.railway.app/admin/users?api_server_url=https%3A%2F%2Fevil.example',
      'https://airi-server-dev.up.railway.app/api/admin',
    )).toBe(
      'https://admin-preview.example/users?api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app',
    )
  })

  it('routes server-dev default admin UI redirects to the matching Pages branch', () => {
    expect(buildAdminUiRedirectUrl(
      'https://admin.airi.build',
      'https://airi-server-dev.up.railway.app/admin/users?query=alice',
      'https://airi-server-dev.up.railway.app',
    )).toBe(
      'https://server-dev.airi-server-admin.pages.dev/users?query=alice&api_server_url=https%3A%2F%2Fairi-server-dev.up.railway.app',
    )
  })

  it('keeps an explicitly configured admin UI URL for server-dev', () => {
    expect(resolveAdminUiUrl(
      'https://admin-preview.example',
      'https://airi-server-dev.up.railway.app',
    )).toBe('https://admin-preview.example')
  })
})
