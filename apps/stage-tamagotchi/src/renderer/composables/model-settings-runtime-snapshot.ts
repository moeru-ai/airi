import type {
  ModelSettingsRuntimeSnapshot,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeChannelEvent } from '../../shared/model-settings-runtime'

import {
  createEmptyModelSettingsRuntimeSnapshot,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { useBroadcastChannel } from '@vueuse/core'
import { onMounted, onUnmounted, ref, watch } from 'vue'

import {
  modelSettingsRuntimeSnapshotChannelName,
} from '../../shared/model-settings-runtime'

export function useModelSettingsRuntimeSnapshot() {
  const runtimeSnapshot = ref<ModelSettingsRuntimeSnapshot>(createEmptyModelSettingsRuntimeSnapshot())
  const { data, post } = useBroadcastChannel<ModelSettingsRuntimeChannelEvent, ModelSettingsRuntimeChannelEvent>({
    name: modelSettingsRuntimeSnapshotChannelName,
  })

  const requestCurrent = () => {
    post({ type: 'request-current' })
  }

  const syncFromOwner = () => {
    requestCurrent()
  }
  const syncFromOwnerWhenVisible = () => {
    if (document.visibilityState === 'visible')
      requestCurrent()
  }

  onMounted(() => {
    requestCurrent()
    window.addEventListener('focus', syncFromOwner)
    document.addEventListener('visibilitychange', syncFromOwnerWhenVisible)
  })

  onUnmounted(() => {
    window.removeEventListener('focus', syncFromOwner)
    document.removeEventListener('visibilitychange', syncFromOwnerWhenVisible)
  })

  watch(data, (event) => {
    if (!event)
      return

    if (event.type === 'snapshot') {
      runtimeSnapshot.value = event.snapshot
      return
    }

    if (event.type === 'owner-gone') {
      if (runtimeSnapshot.value.ownerInstanceId !== event.ownerInstanceId)
        return

      runtimeSnapshot.value = createEmptyModelSettingsRuntimeSnapshot()
    }
  })

  return {
    runtimeSnapshot,
    requestCurrent,
  }
}
