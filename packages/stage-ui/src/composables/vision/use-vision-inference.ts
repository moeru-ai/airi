import type { Conversation } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { AiriExtension } from '../../types/airiCard'
import type { VisionWorkloadId } from './use-vision-workloads'

import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useLLM } from '../../stores/ai/chat-llm/llm'
import { useVisionStore } from '../../stores/modules/vision'
import { useProviderStore } from '../../stores/providers/provider'
import { getVisionWorkload } from './use-vision-workloads'

export interface VisionInferenceInput {
  imageDataUrl: string
  workloadId: VisionWorkloadId
  promptOverride?: string
  /** Conversation-owned selection; omitted for window-local screen inference. */
  selection?: AiriExtension['modules']['vision']
  /** Cancels this read when its owning chat turn ends. */
  abortSignal?: AbortSignal
}

// TODO: this should be configurable
const VISION_INFERENCE_TIMEOUT_MS = 60_000

function parseDataUrl(dataUrl: string) {
  if (!dataUrl.startsWith('data:'))
    return { mimeType: 'image/png', base64: dataUrl, url: dataUrl }

  const [, meta, data] = dataUrl.match(/^data:([^,]+),(.*)$/) || []
  const mimeType = meta?.split(';')[0] || 'image/png'
  const base64 = meta?.includes('base64') ? data : btoa(data)
  return {
    mimeType,
    base64,
    url: `data:${mimeType};base64,${base64}`,
  }
}

export function useVisionInference() {
  const llmStore = useLLM()
  const providersStore = useProviderStore()
  const visionStore = useVisionStore()
  const { activeProvider, activeModel, ollamaThinkingEnabled } = storeToRefs(visionStore)

  const lastText = ref('')

  async function runVisionInference(input: VisionInferenceInput) {
    const providerId = input.selection?.provider ?? activeProvider.value
    const modelId = input.selection?.model ?? activeModel.value
    if (!providerId || !modelId)
      throw new Error('Vision provider/model not configured')

    const provider = await providersStore.getChatProviderInstance(providerId)
    const workload = getVisionWorkload(input.workloadId)
    const prompt = input.promptOverride ?? workload.prompt
    const { url } = parseDataUrl(input.imageDataUrl)
    const visionProvider: GenerationProvider = providerId === 'vision-ollama'
      ? {
          generation(model) {
            const request = provider.generation(model)
            if (request.protocol !== 'chat-completions')
              return request
            return { ...request, config: { ...request.config, think: ollamaThinkingEnabled.value } }
          },
        }
      : provider

    const context: Conversation = { turns: [{
      id: 'vision-input',
      type: 'user',
      content: [{ type: 'text', text: prompt }, { type: 'image', url }],
    }] }

    let buffer = ''
    const abortController = new AbortController()
    const timeoutHandle = setTimeout(() => {
      abortController.abort(new Error(`Vision inference timed out after ${VISION_INFERENCE_TIMEOUT_MS}ms`))
    }, VISION_INFERENCE_TIMEOUT_MS)

    try {
      await llmStore.stream(modelId, visionProvider, context, {
        abortSignal: input.abortSignal ? AbortSignal.any([input.abortSignal, abortController.signal]) : abortController.signal,
        onStreamEvent: (event) => {
          if (event.type === 'text-delta') {
            buffer += event.text
          }
        },
      })
    }
    catch (error) {
      if (abortController.signal.aborted) {
        throw abortController.signal.reason instanceof Error
          ? abortController.signal.reason
          : new Error(`Vision inference timed out after ${VISION_INFERENCE_TIMEOUT_MS}ms`)
      }
      throw error
    }
    finally {
      clearTimeout(timeoutHandle)
    }

    lastText.value = buffer.trim()
    return lastText.value
  }

  return {
    lastText,
    runVisionInference,
  }
}
