import type { CommonContentPart } from '@xsai/shared-chat'

import type { VisionWorkloadId } from '../../../composables/vision/use-vision-workloads'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useVisionInference } from '../../../composables/vision'
import { getVisionWorkload } from '../../../composables/vision/use-vision-workloads'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useVisionStore } from './store'

export interface VisionCapturePayload {
  imageDataUrl: string
  workloadId: VisionWorkloadId
  sourceId?: string
  capturedAt?: number
  publishContext?: boolean
}

export const useVisionOrchestratorStore = defineStore('vision-orchestrator', () => {
  const visionStore = useVisionStore()
  const { activeProvider, activeModel } = storeToRefs(visionStore)
  const modsServerChannelStore = useModsServerChannelStore()
  const { runVisionInference, lastText } = useVisionInference()

  const lastResultText = ref('')
  const lastResultAt = ref<number | null>(null)
  const lastError = ref<string | null>(null)
  const lastWorkloadId = ref<VisionWorkloadId>('screen:interpret')

  async function processCapture(payload: VisionCapturePayload) {
    if (!activeProvider.value || !activeModel.value)
      throw new Error('Vision model is not configured')

    lastWorkloadId.value = payload.workloadId

    const text = await runVisionInference({
      imageDataUrl: payload.imageDataUrl,
      workloadId: payload.workloadId,
    })

    lastResultText.value = text
    lastResultAt.value = Date.now()
    lastError.value = null

    if (payload.publishContext) {
      const workload = getVisionWorkload(payload.workloadId)
      const content: CommonContentPart[] = [
        { type: 'text', text },
        {
          type: 'image_url',
          image_url: {
            url: payload.imageDataUrl,
          },
        },
      ]

      modsServerChannelStore.sendContextUpdate({
        strategy: ContextUpdateStrategy.ReplaceSelf,
        text,
        content,
        metadata: {
          module: 'vision',
          workload: workload.id,
          workloadLabel: workload.label,
          sourceId: payload.sourceId,
          capturedAt: payload.capturedAt,
          provider: activeProvider.value,
          model: activeModel.value,
        },
      })
      return { contextUpdates: 1, text }
    }

    return { contextUpdates: 0, text }
  }

  function recordError(error: unknown) {
    lastError.value = error instanceof Error ? error.message : String(error)
  }

  return {
    lastText,
    lastResultText,
    lastResultAt,
    lastError,
    lastWorkloadId,
    processCapture,
    recordError,
  }
})
