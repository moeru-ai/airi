import type { StaticAssetSession } from './types'

import { describe, expect, it, vi } from 'vitest'

import { createStaticAssetSessionStore } from './session-store'

function tryMutateCookieValue(session: StaticAssetSession, cookieValue: string) {
  try {
    Object.assign(session, { cookieValue })
  }
  catch {
    // Frozen snapshots reject mutation; the assertion that follows verifies store state.
  }
}

/**
 * @example
 * describe('createStaticAssetSessionStore', () => {})
 */
describe('createStaticAssetSessionStore', () => {
  /**
   * @example
   * it('creates and validates cookie-backed asset session', () => {})
   */
  it('creates and validates cookie-backed asset session', () => {
    const now = vi.fn(() => 1000)
    const store = createStaticAssetSessionStore({ now })
    const session = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: '',
      ttlMs: 30_000,
      version: '0.1.0',
    })

    expect(session.assetSessionId).toBeTruthy()
    expect(session.cookieName).toContain(session.assetSessionId)
    expect(session.cookieValue).toBeTruthy()
    expect(store.validateRequest({
      assetPath: 'assets/index.js',
      assetSessionId: session.assetSessionId,
      cookieValue: session.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    }).ok).toBe(true)
  })

  /**
   * @example
   * it('rejects mismatched extension and revoked sessions', () => {})
   */
  it('rejects mismatched extension and revoked sessions', () => {
    const now = vi.fn(() => 1000)
    const store = createStaticAssetSessionStore({ now })
    const session = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: '',
      ttlMs: 30_000,
      version: '0.1.0',
    })

    expect(store.validateRequest({
      assetPath: 'index.html',
      assetSessionId: session.assetSessionId,
      cookieValue: session.cookieValue,
      extensionId: 'other-plugin',
      version: '0.1.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_EXTENSION_MISMATCH',
        status: 401,
      },
      ok: false,
    })

    expect(store.revokeByOwnerSessionId('plugin-session-1')).toHaveLength(1)
    expect(store.validateRequest({
      assetPath: 'index.html',
      assetSessionId: session.assetSessionId,
      cookieValue: session.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_SESSION_NOT_FOUND',
        status: 401,
      },
      ok: false,
    })
  })

  /**
   * @example
   * it('rejects invalid cookie, version, path, and expired requests', () => {})
   */
  it('rejects invalid cookie, version, path, and expired requests', () => {
    const now = vi.fn(() => 1000)
    const store = createStaticAssetSessionStore({ now })
    const session = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: 'assets/',
      ttlMs: 30_000,
      version: '0.1.0',
    })

    expect(store.validateRequest({
      assetPath: 'assets/index.js',
      assetSessionId: session.assetSessionId,
      cookieValue: undefined,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_COOKIE_MISSING',
        status: 401,
      },
      ok: false,
    })

    expect(store.validateRequest({
      assetPath: 'assets/index.js',
      assetSessionId: session.assetSessionId,
      cookieValue: 'wrong-cookie',
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_COOKIE_MISMATCH',
        status: 401,
      },
      ok: false,
    })

    expect(store.validateRequest({
      assetPath: 'assets/index.js',
      assetSessionId: session.assetSessionId,
      cookieValue: session.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.2.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_VERSION_MISMATCH',
        status: 401,
      },
      ok: false,
    })

    expect(store.validateRequest({
      assetPath: '',
      assetSessionId: session.assetSessionId,
      cookieValue: session.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_PATH_EMPTY',
        status: 401,
      },
      ok: false,
    })

    expect(store.validateRequest({
      assetPath: 'other/index.js',
      assetSessionId: session.assetSessionId,
      cookieValue: session.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_PATH_PREFIX_MISMATCH',
        status: 401,
      },
      ok: false,
    })

    now.mockReturnValue(31_001)

    expect(store.validateRequest({
      assetPath: 'assets/index.js',
      assetSessionId: session.assetSessionId,
      cookieValue: session.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_SESSION_EXPIRED',
        status: 401,
      },
      ok: false,
    })
  })

  /**
   * @example
   * it('refreshes and revokes sessions by id, extension, and all records', () => {})
   */
  it('refreshes and revokes sessions by id, extension, and all records', () => {
    const now = vi.fn(() => 1000)
    const store = createStaticAssetSessionStore({ now })
    const firstSession = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: '',
      ttlMs: 30_000,
      version: '0.1.0',
    })
    const secondSession = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-2',
      pathPrefix: '',
      ttlMs: 30_000,
      version: '0.1.0',
    })
    const thirdSession = store.createSession({
      extensionId: 'airi-plugin-game-go',
      ownerSessionId: 'plugin-session-3',
      pathPrefix: '',
      ttlMs: 30_000,
      version: '0.1.0',
    })

    now.mockReturnValue(2000)

    expect(store.refreshSession(firstSession.assetSessionId)).toMatchObject({
      assetSessionId: firstSession.assetSessionId,
      expiresAt: 32_000,
    })
    expect(store.revokeSession(firstSession.assetSessionId)).toMatchObject({
      assetSessionId: firstSession.assetSessionId,
    })
    expect(store.revokeByExtensionId('airi-plugin-game-chess')).toEqual([secondSession])
    expect(store.revokeAll()).toEqual([thirdSession])
  })

  /**
   * @example
   * it('returns immutable snapshots that cannot mutate internal session state', () => {})
   */
  it('returns immutable snapshots that cannot mutate internal session state', () => {
    const now = vi.fn(() => 1000)
    const store = createStaticAssetSessionStore({ now })
    const createdSession = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: '',
      ttlMs: 30_000,
      version: '0.1.0',
    })
    const originalCookieValue = createdSession.cookieValue

    tryMutateCookieValue(createdSession, 'mutated-create-cookie')

    const firstValidation = store.validateRequest({
      assetPath: 'index.html',
      assetSessionId: createdSession.assetSessionId,
      cookieValue: originalCookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })
    expect(firstValidation.ok).toBe(true)
    expect(Object.isFrozen(createdSession)).toBe(true)
    if (!firstValidation.ok) {
      throw firstValidation.error
    }

    tryMutateCookieValue(firstValidation.session, 'mutated-validation-cookie')

    const secondValidation = store.validateRequest({
      assetPath: 'index.html',
      assetSessionId: createdSession.assetSessionId,
      cookieValue: originalCookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })
    expect(secondValidation.ok).toBe(true)
    expect(Object.isFrozen(firstValidation.session)).toBe(true)
    if (!secondValidation.ok) {
      throw secondValidation.error
    }

    now.mockReturnValue(2000)
    const refreshedSession = store.refreshSession(createdSession.assetSessionId)
    expect(refreshedSession).toBeTruthy()
    if (!refreshedSession) {
      throw new Error('Expected refreshed session')
    }

    tryMutateCookieValue(refreshedSession, 'mutated-refresh-cookie')

    const thirdValidation = store.validateRequest({
      assetPath: 'index.html',
      assetSessionId: createdSession.assetSessionId,
      cookieValue: originalCookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })
    expect(thirdValidation.ok).toBe(true)
    expect(Object.isFrozen(refreshedSession)).toBe(true)

    const revokedSessions = store.revokeByOwnerSessionId('plugin-session-1')
    expect(revokedSessions).toHaveLength(1)
    const revokedSession = revokedSessions[0]
    expect(revokedSession).toBeTruthy()
    if (!revokedSession) {
      throw new Error('Expected revoked session')
    }

    tryMutateCookieValue(revokedSession, 'mutated-revoked-cookie')

    expect(createdSession.cookieValue).toBe(originalCookieValue)
    expect(Object.isFrozen(revokedSession)).toBe(true)
  })

  /**
   * @example
   * it('rejects invalid TTL values during session creation', () => {})
   */
  it('rejects invalid TTL values during session creation', () => {
    const store = createStaticAssetSessionStore({ now: vi.fn(() => 1000) })
    const input = {
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: '',
      version: '0.1.0',
    }

    for (const ttlMs of [Number.NaN, Number.POSITIVE_INFINITY, 0, -1]) {
      expect(() => store.createSession({
        ...input,
        ttlMs,
      })).toThrow(RangeError)
    }
  })

  /**
   * @example
   * it('rejects traversal-like asset paths and prefixes at the store boundary', () => {})
   */
  it('rejects traversal-like asset paths and prefixes at the store boundary', () => {
    const store = createStaticAssetSessionStore({ now: vi.fn(() => 1000) })
    const session = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: 'assets/',
      ttlMs: 30_000,
      version: '0.1.0',
    })

    for (const assetPath of [
      'assets/../secret.js',
      'assets\\..\\secret.js',
      'assets%2Fsecret.js',
    ]) {
      expect(store.validateRequest({
        assetPath,
        assetSessionId: session.assetSessionId,
        cookieValue: session.cookieValue,
        extensionId: 'airi-plugin-game-chess',
        version: '0.1.0',
      })).toMatchObject({
        error: {
          code: 'EXTENSION_ASSET_PATH_PREFIX_MISMATCH',
          status: 401,
        },
        ok: false,
      })
    }

    expect(() => store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: '../',
      ttlMs: 30_000,
      version: '0.1.0',
    })).toThrow(RangeError)
  })

  /**
   * @example
   * it('applies directory and exact-file prefix semantics', () => {})
   */
  it('applies directory and exact-file prefix semantics', () => {
    const store = createStaticAssetSessionStore({ now: vi.fn(() => 1000) })
    const directorySession = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-1',
      pathPrefix: 'assets/',
      ttlMs: 30_000,
      version: '0.1.0',
    })
    const exactSession = store.createSession({
      extensionId: 'airi-plugin-game-chess',
      ownerSessionId: 'plugin-session-2',
      pathPrefix: 'assets',
      ttlMs: 30_000,
      version: '0.1.0',
    })

    expect(store.validateRequest({
      assetPath: 'assets/index.js',
      assetSessionId: directorySession.assetSessionId,
      cookieValue: directorySession.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    }).ok).toBe(true)

    expect(store.validateRequest({
      assetPath: 'assets',
      assetSessionId: exactSession.assetSessionId,
      cookieValue: exactSession.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    }).ok).toBe(true)

    expect(store.validateRequest({
      assetPath: 'assets/index.js',
      assetSessionId: exactSession.assetSessionId,
      cookieValue: exactSession.cookieValue,
      extensionId: 'airi-plugin-game-chess',
      version: '0.1.0',
    })).toMatchObject({
      error: {
        code: 'EXTENSION_ASSET_PATH_PREFIX_MISMATCH',
        status: 401,
      },
      ok: false,
    })
  })
})
