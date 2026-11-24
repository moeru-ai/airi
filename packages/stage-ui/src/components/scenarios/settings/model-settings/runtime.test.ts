import type { Live2DInputMapping } from '@proj-airi/stage-ui-live2d'

import { describe, expect, it } from 'vitest'

import { createEmptyModelSettingsRuntimeSnapshot, resolveModelSettingsLive2DInputMapping } from './runtime'

const mapping: Live2DInputMapping = {
  status: 'ready',
  bindings: [{
    source: 'ParamAngleX',
    target: 'ParamTurnInput',
    sourceScale: 1,
    sourceOffset: 0,
    inputMin: -30,
    inputMax: 30,
    outputMin: -10,
    outputMax: 10,
    clampInput: true,
    clampOutput: true,
    smoothing: 0,
  }],
  physicsOutputs: ['ParamBodyAngleX'],
  issues: [],
}

describe('model-settings input mapping snapshots', () => {
  const snapshot = createEmptyModelSettingsRuntimeSnapshot({
    renderer: 'live2d',
    phase: 'mounted',
    live2dInputMapping: { modelId: 'display-model-a', mapping },
  })

  it('reads a structured-cloned mapping for the selected display model', () => {
    expect(resolveModelSettingsLive2DInputMapping(structuredClone(snapshot), 'display-model-a')).toEqual(mapping)
  })

  it('rejects the previous model metadata as soon as another model is selected', () => {
    expect(resolveModelSettingsLive2DInputMapping(snapshot, 'display-model-b')).toBeUndefined()
    expect(resolveModelSettingsLive2DInputMapping(snapshot, undefined)).toBeUndefined()
    expect(resolveModelSettingsLive2DInputMapping(snapshot, '')).toBeUndefined()
  })

  it('does not expose metadata while loading or after changing renderer', () => {
    expect(resolveModelSettingsLive2DInputMapping({ ...snapshot, phase: 'loading' }, 'display-model-a')).toBeUndefined()
    expect(resolveModelSettingsLive2DInputMapping({ ...snapshot, renderer: 'vrm' }, 'display-model-a')).toBeUndefined()
    expect(resolveModelSettingsLive2DInputMapping(createEmptyModelSettingsRuntimeSnapshot(), 'display-model-a')).toBeUndefined()
  })
})
