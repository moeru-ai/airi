import { describe, expect, it } from 'vitest'

import { DisposableStore } from '../extension/disposable'
import { defineKit, defineKitContract, kitUseFailure } from './index'

describe('defineKit', () => {
  it('defines a Consumer contract without a Provider implementation', () => {
    const contract = defineKitContract<{ ping: () => string }>({
      id: 'kit.contract',
      version: '1.0.0',
    })

    expect(contract).toEqual({
      id: 'kit.contract',
      version: '1.0.0',
    })
    expect(contract).not.toHaveProperty('createClient')
  })

  it('defines a typed kit reference with expose policy metadata', () => {
    const kit = defineKit({
      id: 'kit.test',
      version: '1.0.0',
      allowedExposePolicies: ['local-only', 'remote-observable'],
      defaultExposePolicy: 'local-only',
      createClient: runtime => ({
        identity: `${runtime.extensionId}:${runtime.moduleId}`,
      }),
    })

    expect(kit.id).toBe('kit.test')
    expect(kit.defaultExposePolicy).toBe('local-only')
    expect(kit.createClient({
      extensionId: 'extension-a',
      sessionId: 'session-a',
      moduleId: 'module-a',
      subscriptions: new DisposableStore(),
    }).identity).toBe('extension-a:module-a')
  })

  it('creates typed kit use failures', () => {
    const kit = defineKit({
      id: 'kit.missing',
      version: '1.0.0',
      createClient: () => ({}),
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
