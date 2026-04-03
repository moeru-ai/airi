import { describe, expect, it } from 'vitest'

import * as runtimeModule from '../index'

describe('vishot runtime exports', () => {
  it('keeps framework-agnostic helpers on the root export only', () => {
    expect(runtimeModule.markScenarioReady).toBeTypeOf('function')
    expect(runtimeModule.resetScenarioReady).toBeTypeOf('function')
    expect('ScenarioCanvas' in runtimeModule).toBe(false)
    expect('ScenarioCaptureRoot' in runtimeModule).toBe(false)
  })

  it('exposes vue-specific bindings from the vue subpath', async () => {
    const vueModule = await import('../vue')

    expect(vueModule.ScenarioCanvas).toBeTruthy()
    expect(vueModule.ScenarioCaptureRoot).toBeTruthy()
  })
})
