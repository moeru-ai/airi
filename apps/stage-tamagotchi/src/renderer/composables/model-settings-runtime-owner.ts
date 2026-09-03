import type { Live2DExpressionSettingsCommand } from '@proj-airi/stage-ui-live2d/stores/expression-store'
import type { ModelSettingsRuntimeSnapshot } from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import type { MaybeRefOrGetter } from 'vue'

import type { ModelSettingsRuntimeChannelEvent } from '../../shared/model-settings-runtime'

import { tryCatch } from '@moeru/std'
import { useBroadcastChannel } from '@vueuse/core'
import { onBeforeUnmount, toValue, watch } from 'vue'

import { modelSettingsRuntimeSnapshotChannelName } from '../../shared/model-settings-runtime'

interface UseModelSettingsRuntimeOwnerOptions {
  ownerInstanceId: string
  renderer: MaybeRefOrGetter<ModelSettingsRuntimeSnapshot['renderer'] | undefined>
  runtimeSnapshot: MaybeRefOrGetter<ModelSettingsRuntimeSnapshot>
  applyLive2DExpressionCommand: (command: Live2DExpressionSettingsCommand) => void
}

/**
 * Owns the model-settings channel for the renderer that controls the active model.
 *
 * The owner publishes runtime snapshots and accepts commands for its current owner ID.
 * Commands for stale owners or non-Live2D renderers do not change the expression store.
 */
export function useModelSettingsRuntimeOwner(options: UseModelSettingsRuntimeOwnerOptions) {
  const { data, post } = useBroadcastChannel<ModelSettingsRuntimeChannelEvent, ModelSettingsRuntimeChannelEvent>({
    name: modelSettingsRuntimeSnapshotChannelName,
  })

  function postEvent(event: ModelSettingsRuntimeChannelEvent) {
    const { error } = tryCatch(() => post(event))
    if (error)
      console.warn('[Model Settings Runtime] Failed to post channel event:', error)
  }

  watch(() => toValue(options.runtimeSnapshot), (snapshot) => {
    postEvent({ type: 'snapshot', snapshot })
  }, { immediate: true })

  watch(data, (event) => {
    if (!event)
      return

    if (event.type === 'request-current') {
      postEvent({ type: 'snapshot', snapshot: toValue(options.runtimeSnapshot) })
      return
    }

    if (event.type !== 'live2d-expression-command')
      return

    if (event.ownerInstanceId !== options.ownerInstanceId || toValue(options.renderer) !== 'live2d')
      return

    options.applyLive2DExpressionCommand(event.command)
  })

  onBeforeUnmount(() => {
    postEvent({
      type: 'owner-gone',
      ownerInstanceId: options.ownerInstanceId,
    })
  })
}
