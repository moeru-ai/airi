import { describe, expect, it } from 'vitest'

import { KitRegistryService } from './kits'

describe('kitRegistryService', () => {
  it('registers kits and resolves compatible kits by runtime', () => {
    const service = new KitRegistryService()

    const widgetKit = service.register({
      capabilities: [
        { actions: ['announce', 'activate'], key: 'kit.widget.module' },
      ],
      kitId: 'kit.widget',
      runtimes: ['electron', 'web'],
      version: '1.0.0',
    })
    service.register({
      capabilities: [{ actions: ['publish'], key: 'kit.system.channel' }],
      kitId: 'kit.system',
      runtimes: ['node'],
      version: '1.0.0',
    })

    expect(widgetKit.kitId).toBe('kit.widget')
    expect(service.get('kit.widget')).toBe(widgetKit)
    expect(service.list()).toHaveLength(2)
    expect(service.listByRuntime('web')).toEqual([widgetKit])
  })

  it('rejects conflicting duplicate kit registration', () => {
    const service = new KitRegistryService()

    service.register({
      capabilities: [{ actions: ['announce'], key: 'kit.widget.module' }],
      kitId: 'kit.widget',
      runtimes: ['electron'],
      version: '1.0.0',
    })

    expect(() =>
      service.register({
        capabilities: [{ actions: ['announce', 'activate'], key: 'kit.widget.module' }],
        kitId: 'kit.widget',
        runtimes: ['electron', 'web'],
        version: '1.0.1',
      }),
    ).toThrowError(/duplicate kit registration/i)
  })

  it('accepts semantically equivalent duplicate kit registration with reordered arrays', () => {
    const service = new KitRegistryService()

    const original = service.register({
      capabilities: [
        { actions: ['announce', 'activate'], key: 'kit.widget.module' },
        { actions: ['withdraw'], key: 'kit.widget.panel' },
      ],
      kitId: 'kit.widget',
      runtimes: ['electron', 'web'],
      version: '1.0.0',
    })

    const duplicate = service.register({
      capabilities: [
        { actions: ['withdraw'], key: 'kit.widget.panel' },
        { actions: ['activate', 'announce'], key: 'kit.widget.module' },
      ],
      kitId: 'kit.widget',
      runtimes: ['web', 'electron'],
      version: '1.0.0',
    })

    expect(duplicate).toBe(original)
  })
})
