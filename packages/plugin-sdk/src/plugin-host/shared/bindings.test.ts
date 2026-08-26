import { parse } from 'valibot'
import { describe, expect, it } from 'vitest'

import { bindingRecordSchema } from './bindings'

describe('bindingRecordSchema', () => {
  it('accepts generic host-level module record without business coupling', () => {
    const parsed = parse(bindingRecordSchema, {
      config: { mountPoint: 'widgets' },
      kitId: 'kit.widget',
      kitModuleType: 'panel',
      moduleId: 'board-main',
      ownerExtensionId: 'demo-plugin',
      ownerSessionId: 'extension-session-1',
      revision: 1,
      runtime: 'electron',
      state: 'announced',
      updatedAt: Date.now(),
    })

    expect(parsed.kitModuleType).toBe('panel')
    expect(parsed.state).toBe('announced')
  })

  it('rejects an unsupported module state', () => {
    expect(() =>
      parse(bindingRecordSchema, {
        config: { mountPoint: 'widgets' },
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        moduleId: 'board-main',
        ownerExtensionId: 'demo-plugin',
        ownerSessionId: 'extension-session-1',
        revision: 1,
        runtime: 'electron',
        state: 'booting',
        updatedAt: 1712500000000,
      }),
    ).toThrowError()
  })

  it('rejects a negative revision', () => {
    expect(() =>
      parse(bindingRecordSchema, {
        config: { mountPoint: 'widgets' },
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        moduleId: 'board-main',
        ownerExtensionId: 'demo-plugin',
        ownerSessionId: 'extension-session-1',
        revision: -1,
        runtime: 'electron',
        state: 'announced',
        updatedAt: 1712500000000,
      }),
    ).toThrowError()
  })

  it('rejects transport-unsafe module config values', () => {
    class ConfigShape {
      public mountPoint = 'widgets'
    }

    expect(() =>
      parse(bindingRecordSchema, {
        config: {
          big: 1n,
          callback: () => undefined,
          mountPoint: new ConfigShape(),
          symbol: Symbol('nope'),
        },
        kitId: 'kit.widget',
        kitModuleType: 'panel',
        moduleId: 'board-main',
        ownerExtensionId: 'demo-plugin',
        ownerSessionId: 'extension-session-1',
        revision: 1,
        runtime: 'electron',
        state: 'announced',
        updatedAt: 1712500000000,
      }),
    ).toThrowError()
  })
})
