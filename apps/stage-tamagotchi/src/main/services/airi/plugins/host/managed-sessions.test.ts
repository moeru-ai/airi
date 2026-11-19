import type { ExtensionManifestV2 } from '@proj-airi/plugin-sdk/plugin-host'

import { describe, expect, it, vi } from 'vitest'

import { ManagedExtensionSessions } from './managed-sessions'

describe('managedExtensionSessions', () => {
  it('correlates loaded ownership with the exact session identity', () => {
    const extensionId = 'session-correlation-extension'
    const sessionId = 'loaded-session'
    const manifest: ExtensionManifestV2 = {
      manifestVersion: 2,
      kind: 'manifest.extension.airi.moeru.ai',
      id: extensionId,
      version: '1.0.0',
      engines: { airi: '*', runtimes: ['electron'] },
      permissions: {},
      entrypoints: { electron: './extension.ts' },
    }
    const sessions = new ManagedExtensionSessions({
      stopRuntime: vi.fn(async () => {}),
      revokeAssets: vi.fn(async () => {}),
    })
    sessions.registerLoaded({ extensionId, sessionId, manifest })

    // ROOT CAUSE:
    //
    // An Extension-only or session-only lookup can accept the wrong asset owner.
    // We fixed this by matching the Extension ID, loaded phase, and session ID.
    expect(sessions.isLoadedSession(extensionId, sessionId)).toBe(true)
    expect(sessions.isLoadedSession(extensionId, 'different-session')).toBe(false)
    expect(sessions.isLoadedSession('different-extension', sessionId)).toBe(false)
  })
})
