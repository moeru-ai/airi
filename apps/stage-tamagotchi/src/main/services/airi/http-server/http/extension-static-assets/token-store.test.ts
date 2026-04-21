import { describe, expect, it, vi } from 'vitest'

import { createExtensionAssetTokenStore } from './token-store'

describe('createExtensionAssetTokenStore', () => {
  it('issues and validates short token', () => {
    const now = vi.fn(() => 1000)
    const store = createExtensionAssetTokenStore({ now })

    const token = store.issue({
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
      sessionId: 'session-1',
      pathPrefix: 'ui/',
      ttlMs: 30_000,
    })

    expect(token.length).toBeLessThanOrEqual(24)
    expect(store.validate(token, {
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
      assetPath: 'ui/index.html',
    }).ok).toBe(true)
  })

  it('rejects mismatched plugin and revoked tokens', () => {
    const now = vi.fn(() => 1000)
    const store = createExtensionAssetTokenStore({ now })

    const token = store.issue({
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
      sessionId: 'session-1',
      pathPrefix: 'ui/',
      ttlMs: 30_000,
    })

    expect(store.validate(token, {
      extensionId: 'other-plugin',
      version: '0.1.0',
      assetPath: 'ui/index.html',
    })).toMatchObject({
      ok: false,
      error: {
        status: 401,
        code: 'EXTENSION_ASSET_EXTENSION_MISMATCH',
      },
    })

    store.revokeByExtensionId('airi-plugin-game-chess')

    expect(store.validate(token, {
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
      assetPath: 'ui/index.html',
    })).toMatchObject({
      ok: false,
      error: {
        status: 401,
        code: 'EXTENSION_ASSET_TOKEN_NOT_FOUND',
      },
    })
  })
})
