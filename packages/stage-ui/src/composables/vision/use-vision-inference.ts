import type { Conversation } from '@proj-airi/core-agent'
import type { GenerationProvider } from '@proj-airi/provider-inference'

import type { VisionWorkloadId } from './use-vision-workloads'

import { errorMessageFrom } from '@moeru/std'
import { Semaphore } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { ref } from 'vue'

import { useLLM } from '../../stores/ai/chat-llm/llm'
import { useVisionActivityStore, useVisionStore } from '../../stores/modules/vision'
import { useProviderStore } from '../../stores/providers/provider'
import { getVisionWorkload } from './use-vision-workloads'

export interface VisionInferenceInput {
  imageDataUrl: string
  workloadId: VisionWorkloadId
  promptOverride?: string
  /** Cancels this read when its owning chat turn ends. */
  abortSignal?: AbortSignal
}

// TODO: this should be configurable
const VISION_INFERENCE_TIMEOUT_MS = 60_000

const DEFAULT_CONCURRENT_VISION_READS = 4

/**
 * Queues the image reads of this window for each vision provider, for
 * attachments, tool images, and the screen ticker. A provider declares its
 * limit, and a read beyond it waits here instead of inside the provider,
 * where its timeout would run.
 *
 * NOTICE:
 * Each window has its own queues. The screen ticker in the devtools window
 * and the chat in the stage window can still reach one provider at once.
 */
const visionReadSlots = new Map<string, Semaphore>()

/** Waits for a read slot. A cancelled read leaves the queue at once. */
async function acquireReadSlot(slots: Semaphore, abortSignal?: AbortSignal) {
  abortSignal?.throwIfAborted()
  const acquired = slots.acquire()
  if (!abortSignal)
    return await acquired

  let rejectAborted: (reason: unknown) => void = () => {}
  const aborted = new Promise<never>((_resolve, reject) => {
    rejectAborted = reject
  })
  const onAbort = () => rejectAborted(abortSignal.reason)
  abortSignal.addEventListener('abort', onAbort, { once: true })
  try {
    await Promise.race([acquired, aborted])
  }
  catch (error) {
    // The slot still arrives later. Pass it on to the next read.
    void acquired.then(() => slots.release())
    throw error
  }
  finally {
    abortSignal.removeEventListener('abort', onAbort)
  }
}

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
  const activityStore = useVisionActivityStore()
  const { activeProvider, activeModel, ollamaThinkingEnabled } = storeToRefs(visionStore)

  const lastText = ref('')

  /** Reads one image with the given vision provider and returns the trimmed text. */
  async function describeImage(providerId: string, modelId: string, input: VisionInferenceInput) {
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
        // A frame description calls no tools. The chat tool list only costs context,
        // and a provider without tool calling rejects it.
        supportsTools: false,
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

    return buffer.trim()
  }

  async function runVisionInference(input: VisionInferenceInput) {
    if (!activeProvider.value || !activeModel.value)
      throw new Error('Vision provider/model not configured')

    const providerId = activeProvider.value
    const modelId = activeModel.value

    let slots = visionReadSlots.get(providerId)
    if (!slots) {
      const concurrentReads = providersStore.findProviderDefinition(providerId)?.capabilities?.vision?.concurrentReads
      slots = new Semaphore(concurrentReads ?? DEFAULT_CONCURRENT_VISION_READS)
      visionReadSlots.set(providerId, slots)
    }
    await acquireReadSlot(slots, input.abortSignal)
    const startedAt = Date.now()
    // Every attempt counts, including a failure before the request, such as a
    // provider that cannot start. The report does not delay or fail the read.
    function recordInference(result: { text: string } | { error: string }) {
      activityStore.recordInference({
        at: Date.now(),
        provider: providerId,
        model: modelId,
        durationMs: Date.now() - startedAt,
        ...result,
      }).catch(error => console.warn('[vision] Failed to report an inference:', error))
    }

    try {
      lastText.value = await describeImage(providerId, modelId, input)
    }
    catch (error) {
      if (!input.abortSignal?.aborted)
        recordInference({ error: errorMessageFrom(error) ?? 'Unknown error' })
      throw error
    }
    finally {
      slots.release()
    }

    recordInference({ text: lastText.value })
    return lastText.value
  }

  return {
    lastText,
    runVisionInference,
  }
}
