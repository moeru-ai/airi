import type { DescribeToolImage } from '../../stores/ai/chat-llm/tool-images'

import { useConsciousnessStore } from '../../stores/modules/consciousness'
import { useVisionStore } from '../../stores/modules/vision'
import { useVisionInference } from './use-vision-inference'

/**
 * Decides when the vision model reads images for a chat model.
 *
 * Use when:
 * - A send, or a rerun of a stored tool call, resolves tools or projects images.
 *
 * Every entry point that resolves chat tools must use {@link toolImageReader}.
 * A tool rerun without it stores the original image, and the next turn sends
 * that image to a chat model that cannot see it.
 */
export function useChatVision() {
  const consciousnessStore = useConsciousnessStore()
  const visionStore = useVisionStore()
  const { runVisionInference } = useVisionInference()

  /**
   * Whether the catalog of the chat provider declares that the model sees images.
   * Most catalogs omit the declaration, so `false` does not prove the model is blind.
   */
  function canSeeImages(model: string) {
    return consciousnessStore.providerModels.find(candidate => candidate.id === model)?.metadata?.abilities?.vision === true
  }

  function needsVisionModel(model: string) {
    return !canSeeImages(model) && visionStore.configured
  }

  /** Whether the vision model reads the images that the user attaches. */
  function readsAttachedImages(model: string) {
    return needsVisionModel(model) && visionStore.useForChat
  }

  /**
   * Returns the reader of tool images for this chat model, or `undefined` when
   * the chat model gets the images itself.
   */
  function toolImageReader(model: string, abortSignal?: AbortSignal): DescribeToolImage | undefined {
    if (!needsVisionModel(model) || !visionStore.useForToolImages)
      return undefined

    return imageDataUrl => runVisionInference({ imageDataUrl, workloadId: 'tool:image', abortSignal })
  }

  return {
    readsAttachedImages,
    toolImageReader,
  }
}
