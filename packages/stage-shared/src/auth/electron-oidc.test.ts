import { describe, expect, it } from 'vitest'

import { electronOidcRedirectPath } from './electron-oidc'

describe('electronOidcRedirectPath', () => {
  it('matches the callback path registered by the API server', () => {
    expect(electronOidcRedirectPath).toBe('/api/auth/oidc/electron-callback')
  })
})
