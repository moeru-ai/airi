import { describe, expect, it } from 'vitest'

import { createExtensionChannelScope, createModuleChannelScope } from './index'

describe('scoped extension channels', () => {
  it('creates independent extension and module scopes over the same context', () => {
    const extension = createExtensionChannelScope({
      extensionId: 'airi-extension-test',
      sessionId: 'session-1',
    })
    const module = createModuleChannelScope(extension, {
      moduleId: 'module-a',
    })

    expect(extension.identity.id).toBe('airi-extension-test')
    expect(extension.identity.sessionId).toBe('session-1')
    expect(module.identity.id).toBe('module-a')
    expect(module.identity.extension).toEqual(extension.identity)
    expect(module.context).toBe(extension.context)
  })
})
