import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { bindingRecordSchema } from './bindings'

describe('bindingRecordSchema', () => {
  it('accepts generic host-level module record without business coupling', () => {
    const parsed = parse(bindingRecordSchema, {
      moduleId: 'board-main',
      ownerSessionId: 'plugin-session-1',
      ownerPluginId: 'demo-plugin',
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      state: 'announced',
      runtime: 'electron',
      revision: 1,
      updatedAt: Date.now(),
      config: { mountPoint: 'widgets' },
    })

    expect(parsed.kitModuleType).toBe('panel')
    expect(parsed.state).toBe('announced')
  })

  it('rejects an unsupported module state', () => {
    expect(() =>
      parse(bindingRecordSchema, {
        moduleId: 'board-main',
        ownerSessionId: 'plugin-session-1',
        ownerPluginId: 'demo-plugin',
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        state: 'booting',
        runtime: 'electron',
        revision: 1,
        updatedAt: 1712500000000,
        config: { mountPoint: 'widgets' },
      }),
    ).toThrowError()
  })

  it('rejects a negative revision', () => {
    expect(() =>
      parse(bindingRecordSchema, {
        moduleId: 'board-main',
        ownerSessionId: 'plugin-session-1',
        ownerPluginId: 'demo-plugin',
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        state: 'announced',
        runtime: 'electron',
        revision: -1,
        updatedAt: 1712500000000,
        config: { mountPoint: 'widgets' },
      }),
    ).toThrowError()
  })

  it('rejects transport-unsafe module config values', () => {
    class ConfigShape {
      public mountPoint = 'widgets'
    }

    expect(() =>
      parse(bindingRecordSchema, {
        moduleId: 'board-main',
        ownerSessionId: 'plugin-session-1',
        ownerPluginId: 'demo-plugin',
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        state: 'announced',
        runtime: 'electron',
        revision: 1,
        updatedAt: 1712500000000,
        config: {
          mountPoint: new ConfigShape(),
          callback: () => undefined,
          symbol: Symbol('nope'),
          big: 1n,
        },
      }),
    ).toThrowError()
  })
})
