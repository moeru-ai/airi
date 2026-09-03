import type { ExpressionEntry, ExpressionGroupDefinition } from '@proj-airi/stage-ui-live2d/stores/expression-store'
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeChannelEvent } from '../../shared/model-settings-runtime'

import { useExpressionStore } from '@proj-airi/stage-ui-live2d/stores/expression-store'
import { createEmptyModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render } from 'vitest-browser-vue'
import { computed, defineComponent, shallowRef } from 'vue'

import { modelSettingsRuntimeSnapshotChannelName } from '../../shared/model-settings-runtime'
import { useModelSettingsRuntimeOwner } from './model-settings-runtime-owner'
import { useModelSettingsRuntimeSnapshot } from './model-settings-runtime-snapshot'

const expressionGroups: ExpressionGroupDefinition[] = [{
  name: 'happy',
  parameters: [{ parameterId: 'ParamHappy', blend: 'Add', value: 1 }],
}]

const expressionEntries: ExpressionEntry[] = [{
  name: 'ParamHappy',
  parameterId: 'ParamHappy',
  blend: 'Add',
  currentValue: 0,
  defaultValue: 0,
  modelDefault: 0,
  targetValue: 1,
}]

describe('model settings runtime channel', () => {
  const manualChannels = new Set<BroadcastChannel>()

  afterEach(() => {
    cleanup()
    for (const channel of manualChannels)
      channel.close()
    manualChannels.clear()
    localStorage.clear()
  })

  // https://github.com/moeru-ai/airi/issues/2450
  it('syncs an expression command with the matching Live2D owner and rejects a stale owner', async () => {
    // ROOT CAUSE:
    //
    // The settings window and the stage window have separate Pinia stores.
    // A component-only test did not cover the channel, owner check, store update, or returned snapshot.
    //
    // We fixed this by exercising the production composables through a real BroadcastChannel pair.
    const ownerInstanceId = 'stage-owner'
    const ownerPinia = createPinia()
    const settingsPinia = createPinia()
    const ownerExpressionStore = useExpressionStore(ownerPinia)
    ownerExpressionStore.registerExpressions('test-model', expressionGroups, expressionEntries)

    const renderer = shallowRef<ModelSettingsRuntimeSnapshot['renderer']>('live2d')
    const ownerSnapshot = computed(() => createEmptyModelSettingsRuntimeSnapshot({
      ownerInstanceId,
      renderer: renderer.value,
      phase: 'mounted',
      controlsLocked: false,
      previewAvailable: true,
      canCapturePreview: false,
      live2dExpressions: ownerExpressionStore.settingsSnapshot,
      updatedAt: Date.now(),
    }))

    let settingsRuntime: ReturnType<typeof useModelSettingsRuntimeSnapshot> | undefined
    const TestHost = defineComponent({
      setup() {
        useModelSettingsRuntimeOwner({
          ownerInstanceId,
          renderer: () => renderer.value,
          runtimeSnapshot: ownerSnapshot,
          applyLive2DExpressionCommand: command => ownerExpressionStore.applySettingsCommand(command),
        })
        settingsRuntime = useModelSettingsRuntimeSnapshot()

        return () => null
      },
    })

    await render(TestHost, {
      global: {
        plugins: [settingsPinia],
      },
    })

    if (!settingsRuntime)
      throw new Error('The settings runtime did not mount.')
    const mountedSettingsRuntime = settingsRuntime

    await vi.waitFor(() => expect(mountedSettingsRuntime.runtimeSnapshot.value.live2dExpressions?.groups).toEqual([{
      name: 'happy',
      active: false,
      exposedToLlm: false,
    }]))

    const staleChannel = new BroadcastChannel(modelSettingsRuntimeSnapshotChannelName)
    manualChannels.add(staleChannel)
    let staleOwnerResponse: ModelSettingsRuntimeChannelEvent | undefined
    staleChannel.addEventListener('message', (event: MessageEvent<ModelSettingsRuntimeChannelEvent>) => {
      if (event.data.type === 'snapshot' && event.data.snapshot.ownerInstanceId === ownerInstanceId)
        staleOwnerResponse = event.data
    })
    staleChannel.postMessage({
      type: 'live2d-expression-command',
      ownerInstanceId: 'stale-owner',
      command: { type: 'toggle', name: 'happy' },
    } satisfies ModelSettingsRuntimeChannelEvent)
    staleChannel.postMessage({ type: 'request-current' } satisfies ModelSettingsRuntimeChannelEvent)

    await vi.waitFor(() => expect(staleOwnerResponse?.type).toBe('snapshot'))
    expect(ownerExpressionStore.settingsSnapshot.groups[0].active).toBe(false)

    mountedSettingsRuntime.sendLive2DExpressionCommand({ type: 'toggle', name: 'happy' })

    await vi.waitFor(() => expect(ownerExpressionStore.settingsSnapshot.groups[0].active).toBe(true))
    await vi.waitFor(() => expect(mountedSettingsRuntime.runtimeSnapshot.value.live2dExpressions?.groups[0].active).toBe(true))
    expect(useExpressionStore(settingsPinia).expressionGroups.size).toBe(0)
  })
})
