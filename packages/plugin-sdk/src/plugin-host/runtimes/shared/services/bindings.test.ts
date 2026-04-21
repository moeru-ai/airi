import { describe, expect, it } from 'vitest'

import { BindingsRegistryService } from './bindings'

describe('bindingsRegistryService', () => {
  it('rejects ownership violations when updating a module from another session', () => {
    const service = new BindingsRegistryService()

    service.bind({
      moduleId: 'm1',
      ownerSessionId: 'session-a',
      ownerPluginId: 'plugin-a',
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      config: {},
      runtime: 'electron',
    })

    expect(() => service.update('session-b', 'plugin-a', 'm1', { config: { size: 'l' } })).toThrowError(/ownership/i)
  })

  it('tracks lifecycle transitions with revision bumps and preserved ownership', () => {
    const service = new BindingsRegistryService()

    const announced = service.bind({
      moduleId: 'm2',
      ownerSessionId: 'session-a',
      ownerPluginId: 'plugin-a',
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      config: { mountPoint: 'widgets' },
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
    const service = new BindingsRegistryService()

    service.bind({
      moduleId: 'm3',
      ownerSessionId: 'session-a',
      ownerPluginId: 'plugin-a',
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      config: {},
      runtime: 'electron',
    })

    service.withdraw('session-a', 'plugin-a', 'm3')

    expect(() => service.activate('session-a', 'plugin-a', 'm3')).toThrowError(/invalid binding lifecycle transition/i)
  })

  it('rejects duplicate module ids from a different owner session', () => {
    const service = new BindingsRegistryService()

    service.bind({
      moduleId: 'm4',
      ownerSessionId: 'session-a',
      ownerPluginId: 'plugin-a',
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      config: {},
      runtime: 'electron',
    })

    expect(() =>
      service.bind({
        moduleId: 'm4',
        ownerSessionId: 'session-b',
        ownerPluginId: 'plugin-b',
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        config: {},
        runtime: 'electron',
      }),
    ).toThrowError(/module id collision/i)
  })

  it('returns the existing record for an idempotent duplicate bind from the same owner', () => {
    const service = new BindingsRegistryService()

    const original = service.bind({
      moduleId: 'm5',
      ownerSessionId: 'session-a',
      ownerPluginId: 'plugin-a',
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      config: { mountPoint: 'widgets' },
      runtime: 'electron',
    })

    const duplicate = service.bind({
      moduleId: 'm5',
      ownerSessionId: 'session-a',
      ownerPluginId: 'plugin-a',
      kitId: 'kit.widget',
      kitModuleType: 'dialog',
      config: { mountPoint: 'mutated', width: 480 },
      runtime: 'web',
    })

    expect(duplicate).toBe(original)
    expect(duplicate.kitModuleType).toBe('panel')
    expect(duplicate.runtime).toBe('electron')
    expect(duplicate.config).toEqual({ mountPoint: 'widgets' })
  })

  it('rejects module reuse with the same session but a different owner plugin', () => {
    const service = new BindingsRegistryService()

    service.bind({
      moduleId: 'm6',
      ownerSessionId: 'session-a',
      ownerPluginId: 'plugin-a',
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      config: {},
      runtime: 'electron',
    })

    expect(() =>
      service.bind({
        moduleId: 'm6',
        ownerSessionId: 'session-a',
        ownerPluginId: 'plugin-b',
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        config: {},
        runtime: 'electron',
      }),
    ).toThrowError(/module id collision/i)
  })

  it('removes a withdrawn binding with unbind for teardown flows', () => {
    const service = new BindingsRegistryService()

    service.bind({
      moduleId: 'm7',
      ownerSessionId: 'session-a',
      ownerPluginId: 'plugin-a',
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      config: {},
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
