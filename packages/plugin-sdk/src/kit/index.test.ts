import { describe, expect, it } from 'vitest'

import { DisposableStore } from '../extension/disposable'
import {
  defineKit,
  defineKitContract,
  defineKitEvent,
  defineKitMethod,
  kitUseFailure,
} from './index'

describe('defineKit', () => {
  it('defines methods and events without a Provider implementation', () => {
    interface PingResult { message: string }

    const contract = defineKitContract({
      id: 'kit.contract',
      version: '1.0.0',
      methods: {
        ping: defineKitMethod<undefined, PingResult>(),
      },
      events: {
        changed: defineKitEvent<PingResult>(),
      },
    })

    expect(contract).toEqual({
      id: 'kit.contract',
      version: '1.0.0',
      methods: {
        ping: { kind: 'method' },
      },
      events: {
        changed: { kind: 'event' },
      },
    })
    expect(contract).not.toHaveProperty('createClient')
  })

  it('rejects a name shared by a method and event', () => {
    expect(() => defineKitContract({
      id: 'kit.duplicate-member',
      version: '1.0.0',
      methods: {
        changed: defineKitMethod<undefined, null>(),
      },
      events: {
        changed: defineKitEvent<null>(),
      },
    })).toThrow('declares `changed` as both a method and an event')
  })

  it('rejects a method named then because Kit clients resolve through promises', () => {
    const reservedMethodName = ['th', 'en'].join('')
    expect(() => defineKitContract({
      id: 'kit.thenable',
      version: '1.0.0',
      methods: {
        [reservedMethodName]: defineKitMethod<undefined, null>(),
      },
      events: {},
    })).toThrow('cannot declare reserved method `then`')
  })

  it('defines a typed host Kit reference with expose policy metadata', () => {
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

  it('creates typed Kit use failures', () => {
    const kit = defineKit({
      id: 'kit.missing',
      version: '1.0.0',
      createClient: () => ({}),
    })

    const result = kitUseFailure(kit, 'missing-kit')

    expect(result.ok).toBe(false)
    if (result.ok) {
      throw new Error('Expected Kit use to fail.')
    }
    expect(result.reason).toBe('missing-kit')
    expect(result.error.message).toContain('kit.missing')
  })
})
