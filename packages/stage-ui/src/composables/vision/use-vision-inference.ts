import type { ChatProvider } from '@xsai-ext/providers/utils'
import type { CommonContentPart, Message } from '@xsai/shared-chat'

import type { VisionWorkloadId } from './use-vision-workloads'

import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useLLM } from '../../stores/llm'
import { useVisionStore } from '../../stores/modules/vision'
import { useProvidersStore } from '../../stores/providers'
import { getVisionWorkload } from './use-vision-workloads'

export interface VisionInferenceInput {
  imageDataUrl: string
  workloadId: VisionWorkloadId
  promptOverride?: string
}

// TODO: this should be configurable
const VISION_INFERENCE_TIMEOUT_MS = 60_000
const DATA_URL_REGEX = /^data:([^,]+),(.*)$/

function parseDataUrl(dataUrl: string) {
  if (!dataUrl.startsWith('data:'))
    return { mimeType: 'image/png', base64: dataUrl, url: dataUrl }

  const [, meta, data] = dataUrl.match(DATA_URL_REGEX) || []
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
  const providersStore = useProvidersStore()
  const visionStore = useVisionStore()
  const { activeProvider, activeModel, ollamaThinkingEnabled } = storeToRefs(visionStore)

  const lastText = ref('')

  async function runVisionInference(input: VisionInferenceInput) {
    if (!activeProvider.value || !activeModel.value)
      throw new Error('Vision provider/model not configured')

    const provider = await providersStore.getProviderInstance<ChatProvider>(activeProvider.value)
    const workload = getVisionWorkload(input.workloadId)
    const prompt = input.promptOverride ?? workload.prompt
    const { url } = parseDataUrl(input.imageDataUrl)
    const visionProvider = activeProvider.value === 'ollama'
      ? {
        ...provider,
        chat(model: string) {
          return {
            ...provider.chat(model),
            think: ollamaThinkingEnabled.value,
          }
        },
      } satisfies ChatProvider
      : provider

    const contentParts: CommonContentPart[] = [
      { type: 'text', text: prompt },
      {
        type: 'image_url',
        image_url: {
          url,
        },
      },
    ]

    const messages: Message[] = [
      { role: 'user', content: contentParts },
    ]

    let buffer = ''
    const abortController = new AbortController()
    const timeoutHandle = setTimeout(() => {
      abortController.abort(new Error(`Vision inference timed out after ${VISION_INFERENCE_TIMEOUT_MS}ms`))
    }, VISION_INFERENCE_TIMEOUT_MS)

    try {
      await llmStore.stream(activeModel.value, visionProvider, messages, {
        abortSignal: abortController.signal,
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
