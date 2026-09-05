import type { Live2DExpressionSettingsCommand } from '@proj-airi/stage-ui-live2d/stores/expression-store'
import type {
  ModelSettingsRuntimeSnapshot,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'

import type { ModelSettingsRuntimeContext } from '../../shared/model-settings-runtime'

import { defineInvoke } from '@moeru/eventa'
import {
  createEmptyModelSettingsRuntimeSnapshot,
} from '@proj-airi/stage-ui/components/scenarios/settings/model-settings/runtime'
import { onMounted, onUnmounted, ref } from 'vue'

import {
  applyLive2DExpressionSettingsCommand,
  getModelSettingsRuntimeContext,
  modelSettingsRuntimeOwnerGone,
  modelSettingsRuntimeSnapshotChanged,
  modelSettingsRuntimeSnapshotRequested,
} from '../../shared/model-settings-runtime'

interface UseModelSettingsRuntimeSnapshotOptions {
  context?: ModelSettingsRuntimeContext
  /** Maximum wait for the stage owner to respond. @default 1000 */
  commandTimeoutMs?: number
}

export function useModelSettingsRuntimeSnapshot(options: UseModelSettingsRuntimeSnapshotOptions = {}) {
  const runtimeSnapshot = ref<ModelSettingsRuntimeSnapshot>(createEmptyModelSettingsRuntimeSnapshot())
  const context = options.context ?? getModelSettingsRuntimeContext()
  const invokeExpressionCommand = defineInvoke(context, applyLive2DExpressionSettingsCommand)

  const requestCurrent = () => {
    void context.emit(modelSettingsRuntimeSnapshotRequested, undefined)
  }

  const sendLive2DExpressionCommand = async (command: Live2DExpressionSettingsCommand) => {
    const snapshot = runtimeSnapshot.value
    if (!snapshot.ownerInstanceId || !snapshot.modelId || snapshot.renderer !== 'live2d' || snapshot.controlsLocked)
      return false

    try {
      const response = await invokeExpressionCommand({
        ownerInstanceId: snapshot.ownerInstanceId,
        modelId: snapshot.modelId,
        command,
      }, {
        signal: AbortSignal.timeout(options.commandTimeoutMs ?? 1000),
      })
      runtimeSnapshot.value = response.snapshot
      return response.applied
    }
    catch (error) {
      runtimeSnapshot.value = createEmptyModelSettingsRuntimeSnapshot()
      requestCurrent()
      console.warn('[Model Settings Runtime] Failed to apply the Live2D expression command:', error)
      return false
    }
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
    sendLive2DExpressionCommand,
  }
}
