import { describe, expect, it } from 'vitest'

import { defaultSignInProviders, isOAuthProviderId, oauthProviders } from './providers'

describe('sign-in provider catalog', () => {
  it('lists Steam alongside OAuth providers in the connected-account catalog', () => {
    expect(defaultSignInProviders.map(provider => provider.id)).toEqual(['google', 'github', 'steam'])
  })

  it('keeps oauthProviders as Google and GitHub only', () => {
    expect(oauthProviders.map(provider => provider.id)).toEqual(['google', 'github'])
  })

  it('narrows OAuth provider ids', () => {
    expect(isOAuthProviderId('google')).toBe(true)
    expect(isOAuthProviderId('github')).toBe(true)
    expect(isOAuthProviderId('steam')).toBe(false)
  })
})
