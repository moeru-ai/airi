import { describe, expect, it } from 'vitest'

import { KitRegistryService } from './kits'

describe('kitRegistryService', () => {
  it('registers kits and resolves compatible kits by runtime', () => {
    const service = new KitRegistryService()

    const widgetKit = service.register({
      kitId: 'kit.widget',
      version: '1.0.0',
      capabilities: [
        { key: 'kit.widget.module', actions: ['announce', 'activate'] },
      ],
      runtimes: ['electron', 'web'],
    })
    service.register({
      kitId: 'kit.system',
      version: '1.0.0',
      capabilities: [{ key: 'kit.system.channel', actions: ['publish'] }],
      runtimes: ['node'],
    })

    expect(widgetKit.kitId).toBe('kit.widget')
    expect(service.get('kit.widget')).toBe(widgetKit)
    expect(service.list()).toHaveLength(2)
    expect(service.listByRuntime('web')).toEqual([widgetKit])
  })

  it('rejects conflicting duplicate kit registration', () => {
    const service = new KitRegistryService()

    service.register({
      kitId: 'kit.widget',
      version: '1.0.0',
      capabilities: [{ key: 'kit.widget.module', actions: ['announce'] }],
      runtimes: ['electron'],
    })

    expect(() =>
      service.register({
        kitId: 'kit.widget',
        version: '1.0.1',
        capabilities: [{ key: 'kit.widget.module', actions: ['announce', 'activate'] }],
        runtimes: ['electron', 'web'],
      }),
    ).toThrowError(/duplicate kit registration/i)
  })

  it('accepts semantically equivalent duplicate kit registration with reordered arrays', () => {
    const service = new KitRegistryService()

    const original = service.register({
      kitId: 'kit.widget',
      version: '1.0.0',
      capabilities: [
        { key: 'kit.widget.module', actions: ['announce', 'activate'] },
        { key: 'kit.widget.panel', actions: ['withdraw'] },
      ],
      runtimes: ['electron', 'web'],
    })

    const duplicate = service.register({
      kitId: 'kit.widget',
      version: '1.0.0',
      capabilities: [
        { key: 'kit.widget.panel', actions: ['withdraw'] },
        { key: 'kit.widget.module', actions: ['activate', 'announce'] },
      ],
      runtimes: ['web', 'electron'],
    })

    expect(duplicate).toBe(original)
  })
})
