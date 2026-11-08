import type {
  ModelSettingsRuntimeSnapshot,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeContext } from '../../shared/model-settings-runtime'

import {
  createEmptyModelSettingsRuntimeSnapshot,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { onMounted, onUnmounted, ref } from 'vue'

import {
  getModelSettingsRuntimeContext,
  modelSettingsRuntimeOwnerGone,
  modelSettingsRuntimeSnapshotChanged,
  modelSettingsRuntimeSnapshotRequested,
} from '../../shared/model-settings-runtime'

interface UseModelSettingsRuntimeSnapshotOptions {
  context?: ModelSettingsRuntimeContext
}

export function useModelSettingsRuntimeSnapshot(options: UseModelSettingsRuntimeSnapshotOptions = {}) {
  const runtimeSnapshot = ref<ModelSettingsRuntimeSnapshot>(createEmptyModelSettingsRuntimeSnapshot())
  const context = options.context ?? getModelSettingsRuntimeContext()

  const requestCurrent = () => {
    void context.emit(modelSettingsRuntimeSnapshotRequested, undefined)
  }

  const syncFromOwner = () => {
    requestCurrent()
  }
  const syncFromOwnerWhenVisible = () => {
    if (document.visibilityState === 'visible')
      requestCurrent()
  }

  const stopSnapshots = context.on(modelSettingsRuntimeSnapshotChanged, (event) => {
    if (event.body)
      runtimeSnapshot.value = event.body
  })
  const stopOwnerGone = context.on(modelSettingsRuntimeOwnerGone, (event) => {
    if (!event.body || runtimeSnapshot.value.ownerInstanceId !== event.body.ownerInstanceId)
      return

    runtimeSnapshot.value = createEmptyModelSettingsRuntimeSnapshot()
  })

  onMounted(() => {
    requestCurrent()
    window.addEventListener('focus', syncFromOwner)
    document.addEventListener('visibilitychange', syncFromOwnerWhenVisible)
  })

  onUnmounted(() => {
    window.removeEventListener('focus', syncFromOwner)
    document.removeEventListener('visibilitychange', syncFromOwnerWhenVisible)
    stopSnapshots()
    stopOwnerGone()
  })

  return {
    runtimeSnapshot,
    requestCurrent,
  }
}
