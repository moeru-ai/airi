import { describe, expect, it } from 'vitest'

import { DisposableStore } from '../extension/disposable'
import { defineKit, kitUseFailure } from './index'

describe('defineKit', () => {
  it('defines a typed kit reference with expose policy metadata', () => {
    const kit = defineKit({
      allowedExposePolicies: ['local-only', 'remote-observable'],
      createClient: runtime => ({
        identity: `${runtime.extensionId}:${runtime.moduleId}`,
      }),
      defaultExposePolicy: 'local-only',
      id: 'kit.test',
      version: '1.0.0',
    })

    expect(kit.id).toBe('kit.test')
    expect(kit.defaultExposePolicy).toBe('local-only')
    expect(kit.createClient({
      extensionId: 'extension-a',
      moduleId: 'module-a',
      sessionId: 'session-a',
      subscriptions: new DisposableStore(),
    }).identity).toBe('extension-a:module-a')
  })

  it('creates typed kit use failures', () => {
    const kit = defineKit({
      createClient: () => ({}),
      id: 'kit.missing',
      version: '1.0.0',
    })

    const result = kitUseFailure(kit, 'missing-kit')

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected kit use to fail.')
    }
    expect(result.reason).toBe('missing-kit')
    expect(result.error.message).toContain('kit.missing')
  })
})
