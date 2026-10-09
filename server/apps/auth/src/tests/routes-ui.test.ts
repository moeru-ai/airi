import { describe, expect, it } from 'vitest'

import { buildAuthUiRedirectUrl, buildAuthUiUrl, resolveAuthUiUrl } from '../routes'

describe('auth UI URL helpers', () => {
  it('builds auth UI URLs under the configured auth base path', () => {
    expect(buildAuthUiUrl('https://accounts.airi.build/ui', '/sign-in', '?client_id=web')).toBe(
      'https://accounts.airi.build/ui/sign-in?client_id=web',
    )
  })

  it('maps server /auth requests to the standalone auth UI while preserving queries', () => {
    expect(buildAuthUiRedirectUrl(
      'https://accounts.airi.build/ui/',
      'https://api.airi.build/auth/verify-email?verified=true',
    )).toBe('https://accounts.airi.build/ui/verify-email?verified=true')
  })

  it('adds the API server origin for standalone auth UI cross-environment redirects', () => {
    expect(buildAuthUiRedirectUrl(
      'https://auth-preview.example/ui/',
      'https://api-dev.airi.build/auth/sign-in?client_id=airi-stage-web&api_server_url=https%3A%2F%2Fevil.example',
      'https://api-dev.airi.build/api/auth',
    )).toBe(
      'https://auth-preview.example/ui/sign-in?client_id=airi-stage-web&api_server_url=https%3A%2F%2Fapi-dev.airi.build',
    )
  })

  it('routes server-dev default auth UI redirects to the matching Pages branch', () => {
    expect(buildAuthUiRedirectUrl(
      'https://accounts.airi.build/ui',
      'https://api-dev.airi.build/auth/sign-in?client_id=airi-stage-web',
      'https://api-dev.airi.build',
    )).toBe(
      'https://server-dev.airi-server-auth.pages.dev/ui/sign-in?client_id=airi-stage-web&api_server_url=https%3A%2F%2Fapi-dev.airi.build',
    )
  })

  it('keeps an explicitly configured auth UI URL for server-dev', () => {
    expect(resolveAuthUiUrl(
      'https://auth-preview.example/ui',
      'https://api-dev.airi.build',
    )).toBe('https://auth-preview.example/ui')
  })
})
