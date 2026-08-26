import type { CommonContentPart } from '@xsai/shared-chat'

import type { VisionWorkloadId } from '../../../composables/vision/use-vision-workloads'

import { errorMessageFrom } from '@moeru/std'
import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { defineStore, storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useVisionInference } from '../../../composables/vision'
import { getVisionWorkload } from '../../../composables/vision/use-vision-workloads'
import { useModsServerChannelStore } from '../../mods/api/channel-server'
import { useVisionStore } from './store'

/**
 * Payload describing one captured frame routed through the vision orchestrator.
 */
export interface VisionCapturePayload {
  /** Timestamp recorded when the frame was captured. */
  capturedAt?: number
  /** JPEG or PNG data URL captured from the selected source. */
  imageDataUrl: string
  /** When `true`, publish the inference result into the character context channel. */
  publishContext?: boolean
  /** Optional source identifier used to keep context updates stable per source. */
  sourceId?: string
  /** Vision workload that describes how the frame should be interpreted. */
  workloadId: VisionWorkloadId
}

function getVisionContextId(payload: Pick<VisionCapturePayload, 'sourceId' | 'workloadId'>) {
  return payload.sourceId
    ? `vision:${payload.workloadId}:${payload.sourceId}`
    : `vision:${payload.workloadId}`
}

/**
 * Coordinates screen-capture inference and optional context publishing for vision workflows.
 *
 * Use when:
 * - A renderer page captures frames and needs multimodal inference results
 * - Successful results may also need to become context updates for downstream modules
 *
 * Expects:
 * - The vision settings store to already contain an active provider and model
 *
 * Returns:
 * - A Pinia store that tracks the latest result, last error, and capture-processing actions
 */
export const useVisionOrchestratorStore = defineStore('vision-orchestrator', () => {
  const visionStore = useVisionStore()
  const { activeModel, activeProvider } = storeToRefs(visionStore)
  const modsServerChannelStore = useModsServerChannelStore()
  const { lastText, runVisionInference } = useVisionInference()

  const lastResultText = ref('')
  const lastResultAt = ref<null | number>(null)
  const lastError = ref<null | string>(null)
  const lastWorkloadId = ref<VisionWorkloadId>('screen:interpret')

  async function processCapture(payload: VisionCapturePayload) {
    if (!activeProvider.value || !activeModel.value) {
      const configurationError = new Error('Vision model is not configured')
      recordError(configurationError)
      throw configurationError
    }

    lastWorkloadId.value = payload.workloadId

    try {
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
          { text, type: 'text' },
          {
            image_url: {
              url: payload.imageDataUrl,
            },
            type: 'image_url',
          },
        ]

        modsServerChannelStore.sendContextUpdate({
          content,
          contextId: getVisionContextId(payload),
          metadata: {
            capturedAt: payload.capturedAt,
            model: activeModel.value,
            module: 'vision',
            provider: activeProvider.value,
            sourceId: payload.sourceId,
            workload: workload.id,
            workloadLabel: workload.label,
          },
          strategy: ContextUpdateStrategy.ReplaceSelf,
          text,
        })
        return { contextUpdates: 1, text }
      }

      return { contextUpdates: 0, text }
    }
    catch (error) {
      recordError(error)
      throw error
    }
  }

  function recordError(error: unknown) {
    lastError.value = errorMessageFrom(error) ?? 'Unknown error'
  }

  return {
    lastError,
    lastResultAt,
    lastResultText,
    lastText,
    lastWorkloadId,
    processCapture,
    recordError,
  }
})
