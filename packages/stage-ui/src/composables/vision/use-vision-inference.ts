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
  /** 是否将原始推理文本保留给 Vision 调试界面，默认为 true */
  retainResult?: boolean
  /** 调用方用于取消当前 Vision 请求的信号 */
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
  const providersStore = useProvidersStore()
  const visionStore = useVisionStore()
  const { activeProvider, activeModel, ollamaThinkingEnabled } = storeToRefs(visionStore)

  const lastText = ref('')

  async function runVisionInference(input: VisionInferenceInput) {
    input.abortSignal?.throwIfAborted()
    if (!activeProvider.value || !activeModel.value)
      throw new Error('Vision provider/model not configured')

    const provider = await providersStore.getProviderInstance<ChatProvider>(activeProvider.value)
    const workload = getVisionWorkload(input.workloadId)
    const prompt = input.promptOverride ?? workload.prompt
    const { url } = parseDataUrl(input.imageDataUrl)
    const visionProvider = activeProvider.value === 'vision-ollama'
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
    /**
     * 将调用方取消状态转发给实际 LLM 流
     *
     * 返回值为 void
     */
    const handleCallerAbort = () => {
      abortController.abort(input.abortSignal?.reason)
    }
    input.abortSignal?.addEventListener('abort', handleCallerAbort, { once: true })
    if (input.abortSignal?.aborted)
      handleCallerAbort()
    const timeoutHandle = setTimeout(() => {
      abortController.abort(new Error(`Vision inference timed out after ${VISION_INFERENCE_TIMEOUT_MS}ms`))
    }, VISION_INFERENCE_TIMEOUT_MS)

    try {
      abortController.signal.throwIfAborted()
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
      input.abortSignal?.removeEventListener('abort', handleCallerAbort)
    }

    const text = buffer.trim()
    if (input.retainResult !== false)
      lastText.value = text
    return text
  }

  return {
    lastText,
    runVisionInference,
  }
}
