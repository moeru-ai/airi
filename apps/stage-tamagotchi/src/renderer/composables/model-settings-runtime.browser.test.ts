import type { Live2DInputMapping } from '@proj-airi/stage-ui-live2d'
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import { createContext } from '@moeru/eventa/adapters/broadcast-channel'
import { createEmptyModelSettingsRuntimeSnapshot, resolveModelSettingsLive2DInputMapping } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, shallowRef } from 'vue'

import { useModelSettingsRuntimeOwner } from './model-settings-runtime-owner'
import { useModelSettingsRuntimeSnapshot } from './model-settings-runtime-snapshot'

const disposals: Array<() => void> = []

function mountComposable<T>(setup: () => T) {
  let result: T | undefined
  const app = createApp({
    setup() {
      result = setup()
      return () => null
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  app.mount(host)
  let mounted = true
  function unmount() {
    if (!mounted)
      return
    mounted = false
    app.unmount()
    host.remove()
  }
  disposals.push(unmount)
  if (result === undefined)
    throw new Error('The composable did not initialize.')
  return { result, unmount }
}

function createRuntimeChannel(name: string) {
  const runtime = createContext(new BroadcastChannel(name), { closeOnDispose: true })
  disposals.push(() => runtime.dispose())
  return runtime.context
}

afterEach(() => {
  for (const dispose of disposals.splice(0).reverse())
    dispose()
})

describe('model-settings runtime across windows', () => {
  it('publishes loaded mappings, rejects an old model, and clears them when the owner closes', async () => {
    const channelName = `model-settings-test:${crypto.randomUUID()}`
    const ownerContext = createRuntimeChannel(channelName)
    const settingsContext = createRuntimeChannel(channelName)
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
      issues: ['unsupported-options'],
    }
    const source = shallowRef<ModelSettingsRuntimeSnapshot>(createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: 'stage-owner',
      renderer: 'live2d',
      phase: 'mounted',
      live2dInputMapping: { modelId: 'display-model-a', mapping },
    }))
    const owner = mountComposable(() => {
      useModelSettingsRuntimeOwner({
        ownerInstanceId: 'stage-owner',
        renderer: () => source.value.renderer,
        runtimeSnapshot: source,
        context: ownerContext,
      })
      return true
    })
    const settings = mountComposable(() => useModelSettingsRuntimeSnapshot({ context: settingsContext })).result

    await vi.waitFor(() => {
      expect(resolveModelSettingsLive2DInputMapping(settings.runtimeSnapshot.value, 'display-model-a')).toEqual(mapping)
    })
    expect(resolveModelSettingsLive2DInputMapping(settings.runtimeSnapshot.value, 'display-model-b')).toBeUndefined()

    source.value = createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: 'stage-owner',
      renderer: 'live2d',
      phase: 'loading',
    })
    await vi.waitFor(() => expect(settings.runtimeSnapshot.value.phase).toBe('loading'))
    expect(settings.runtimeSnapshot.value.live2dInputMapping).toBeUndefined()

    source.value = createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId: 'stage-owner',
      renderer: 'live2d',
      phase: 'mounted',
      live2dInputMapping: { modelId: 'display-model-b', mapping },
    })
    await vi.waitFor(() => {
      expect(resolveModelSettingsLive2DInputMapping(settings.runtimeSnapshot.value, 'display-model-b')).toEqual(mapping)
    })

    owner.unmount()
    await vi.waitFor(() => expect(settings.runtimeSnapshot.value.ownerInstanceId).toBe(''))
    expect(resolveModelSettingsLive2DInputMapping(settings.runtimeSnapshot.value, 'display-model-b')).toBeUndefined()
  })
})
