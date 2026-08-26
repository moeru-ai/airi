import { describe, expect, it } from 'vitest'

import { KitApiBindingRegistryService } from './kit-api-bindings'

describe('kitApiBindingRegistryService', () => {
  it('stores kit API bindings by owning extension session and module', () => {
    const service = new KitApiBindingRegistryService()

    const binding = service.bind({
      config: { title: 'Chess' },
      kitId: 'kit.gamelet',
      kitModuleType: 'gamelet',
      moduleId: 'chess-gamelet',
      ownerExtensionId: 'airi-extension-chess',
      ownerSessionId: 'session-1',
      runtime: 'electron',
    })

    expect(binding.state).toBe('announced')
    expect(service.listByModule('session-1', 'chess-gamelet')).toEqual([binding])
  })

  it('rejects ownership violations when updating a module from another session', () => {
    const service = new KitApiBindingRegistryService()

    service.bind({
      config: {},
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      moduleId: 'm1',
      ownerExtensionId: 'plugin-a',
      ownerSessionId: 'session-a',
      runtime: 'electron',
    })

    expect(() => service.update('session-b', 'plugin-a', 'm1', { config: { size: 'l' } })).toThrowError(/ownership/i)
  })

  it('tracks lifecycle transitions with revision bumps and preserved ownership', () => {
    const service = new KitApiBindingRegistryService()

    const announced = service.bind({
      config: { mountPoint: 'widgets' },
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      moduleId: 'm2',
      ownerExtensionId: 'plugin-a',
      ownerSessionId: 'session-a',
      runtime: 'web',
    })

    const activated = service.activate('session-a', 'plugin-a', 'm2')
    const updated = service.update('session-a', 'plugin-a', 'm2', { config: { mountPoint: 'widgets', width: 320 } })
    const withdrawn = service.withdraw('session-a', 'plugin-a', 'm2')

    expect(announced.state).toBe('announced')
    expect(activated.state).toBe('active')
    expect(updated.revision).toBeGreaterThan(activated.revision)
    expect(updated.config).toEqual({ mountPoint: 'widgets', width: 320 })
    expect(withdrawn.state).toBe('withdrawn')
    expect(service.listByOwner('session-a')).toHaveLength(1)
  })

  it('rejects invalid lifecycle transitions after withdrawal', () => {
    const service = new KitApiBindingRegistryService()

    service.bind({
      config: {},
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      moduleId: 'm3',
      ownerExtensionId: 'plugin-a',
      ownerSessionId: 'session-a',
      runtime: 'electron',
    })

    service.withdraw('session-a', 'plugin-a', 'm3')

    expect(() => service.activate('session-a', 'plugin-a', 'm3')).toThrowError(/invalid binding lifecycle transition/i)
  })

  it('rejects duplicate module ids from a different owner session', () => {
    const service = new KitApiBindingRegistryService()

    service.bind({
      config: {},
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      moduleId: 'm4',
      ownerExtensionId: 'plugin-a',
      ownerSessionId: 'session-a',
      runtime: 'electron',
    })

    expect(() =>
      service.bind({
        config: {},
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        moduleId: 'm4',
        ownerExtensionId: 'plugin-b',
        ownerSessionId: 'session-b',
        runtime: 'electron',
      }),
    ).toThrowError(/module id collision/i)
  })

  it('returns the existing record for an idempotent duplicate bind from the same owner', () => {
    const service = new KitApiBindingRegistryService()

    const original = service.bind({
      config: { mountPoint: 'widgets' },
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      moduleId: 'm5',
      ownerExtensionId: 'plugin-a',
      ownerSessionId: 'session-a',
      runtime: 'electron',
    })

    const duplicate = service.bind({
      config: { mountPoint: 'mutated', width: 480 },
      kitId: 'kit.widget',
      kitModuleType: 'dialog',
      moduleId: 'm5',
      ownerExtensionId: 'plugin-a',
      ownerSessionId: 'session-a',
      runtime: 'web',
    })

    expect(duplicate).toBe(original)
    expect(duplicate.kitModuleType).toBe('panel')
    expect(duplicate.runtime).toBe('electron')
    expect(duplicate.config).toEqual({ mountPoint: 'widgets' })
  })

  it('rejects module reuse with the same session but a different owner plugin', () => {
    const service = new KitApiBindingRegistryService()

    service.bind({
      config: {},
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      moduleId: 'm6',
      ownerExtensionId: 'plugin-a',
      ownerSessionId: 'session-a',
      runtime: 'electron',
    })

    expect(() =>
      service.bind({
        config: {},
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        moduleId: 'm6',
        ownerExtensionId: 'plugin-b',
        ownerSessionId: 'session-a',
        runtime: 'electron',
      }),
    ).toThrowError(/module id collision/i)
  })

  it('removes a withdrawn binding with unbind for teardown flows', () => {
    const service = new KitApiBindingRegistryService()

    service.bind({
      config: {},
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      moduleId: 'm7',
      ownerExtensionId: 'plugin-a',
      ownerSessionId: 'session-a',
      runtime: 'electron',
    })

    service.withdraw('session-a', 'plugin-a', 'm7')

    expect(service.unbind('session-a', 'plugin-a', 'm7')).toEqual(
      expect.objectContaining({
        moduleId: 'm7',
        state: 'withdrawn',
      }),
    )
    expect(service.has('m7')).toBe(false)
  })
})
