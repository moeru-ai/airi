import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import type { MaybeRefOrGetter } from 'vue'

import type { ModelSettingsRuntimeContext } from '../../shared/model-settings-runtime'

import { onBeforeUnmount, toValue, watch } from 'vue'

import {
  getModelSettingsRuntimeContext,
  modelSettingsRuntimeOwnerGone,
  modelSettingsRuntimeSnapshotChanged,
  modelSettingsRuntimeSnapshotRequested,
} from '../../shared/model-settings-runtime'

interface UseModelSettingsRuntimeOwnerOptions {
  ownerInstanceId: string
  renderer: MaybeRefOrGetter<ModelSettingsRuntimeSnapshot['renderer'] | undefined>
  runtimeSnapshot: MaybeRefOrGetter<ModelSettingsRuntimeSnapshot>
  context?: ModelSettingsRuntimeContext
}

/**
 * Owns the model-settings channel for the renderer that controls the active model.
 *
 * The owner publishes runtime snapshots when they change and when a settings window asks.
 */
export function useModelSettingsRuntimeOwner(options: UseModelSettingsRuntimeOwnerOptions) {
  const context = options.context ?? getModelSettingsRuntimeContext()

  function postSnapshot(snapshot: ModelSettingsRuntimeSnapshot) {
    void context.emit(modelSettingsRuntimeSnapshotChanged, snapshot).catch((error) => {
      console.warn('[Model Settings Runtime] Failed to publish the runtime snapshot:', error)
    })
  }

  watch(() => toValue(options.runtimeSnapshot), (snapshot) => {
    postSnapshot(snapshot)
  }, { immediate: true })

  const stopSnapshotRequests = context.on(modelSettingsRuntimeSnapshotRequested, () => {
    postSnapshot(toValue(options.runtimeSnapshot))
  })
  onBeforeUnmount(() => {
    stopSnapshotRequests()
    void context.emit(modelSettingsRuntimeOwnerGone, {
      ownerInstanceId: options.ownerInstanceId,
    }).catch((error) => {
      console.warn('[Model Settings Runtime] Failed to publish owner shutdown:', error)
    })
  })
}
