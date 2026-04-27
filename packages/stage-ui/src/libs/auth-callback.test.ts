import { describe, expect, it, vi } from 'vitest'

import { completeOIDCCallbackUrl } from './auth-callback'

describe('completeOIDCCallbackUrl', () => {
  it('exchanges the native callback authorization code with the persisted PKCE flow', async () => {
    const tokens = {
      access_token: 'access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'refresh-token',
    }
    const flowState = {
      codeVerifier: 'verifier',
      state: 'expected-state',
    }
    const params = {
      clientId: 'airi-stage-pocket',
      redirectUri: 'airi-pocket://auth/callback',
      provider: 'google' as const,
    }
    const exchangeCodeForTokens = vi.fn().mockResolvedValue(tokens)
    const applyOIDCTokens = vi.fn().mockResolvedValue(undefined)
    const fetchSession = vi.fn().mockResolvedValue(true)

    await completeOIDCCallbackUrl('airi-pocket://auth/callback?code=auth-code&state=expected-state', {
      consumeFlowState: () => ({ flowState, params }),
      exchangeCodeForTokens,
      applyOIDCTokens,
      fetchSession,
    })

    expect(exchangeCodeForTokens).toHaveBeenCalledWith('auth-code', flowState, params, 'expected-state')
    expect(applyOIDCTokens).toHaveBeenCalledWith(tokens, 'airi-stage-pocket')
    expect(fetchSession).toHaveBeenCalledOnce()
  })

  it('rejects an OAuth error callback before exchanging tokens', async () => {
    const exchangeCodeForTokens = vi.fn()

    await expect(completeOIDCCallbackUrl('airi-pocket://auth/callback?error=access_denied&error_description=User%20cancelled', {
      consumeFlowState: () => null,
      exchangeCodeForTokens,
      applyOIDCTokens: vi.fn(),
      fetchSession: vi.fn(),
    })).rejects.toThrow('User cancelled')

    expect(exchangeCodeForTokens).not.toHaveBeenCalled()
  })

  it('rejects a callback when the persisted PKCE flow is missing', async () => {
    await expect(completeOIDCCallbackUrl('airi-pocket://auth/callback?code=auth-code&state=expected-state', {
      consumeFlowState: () => null,
      exchangeCodeForTokens: vi.fn(),
      applyOIDCTokens: vi.fn(),
      fetchSession: vi.fn(),
    })).rejects.toThrow('Missing OIDC flow state')
  })
})
