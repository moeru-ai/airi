import type { ModelInfo } from '@proj-airi/provider-inference'

import type { DescribeToolImage } from '../../stores/ai/chat-llm/tool-images'

import { useChatSessionStore } from '../../stores/chat/session-store'
import { useAiriCardStore } from '../../stores/modules/airi-card'
import { useConsciousnessStore } from '../../stores/modules/consciousness'
import { useVisionStore } from '../../stores/modules/vision'
import { useProviderStore } from '../../stores/providers/provider'
import { useVisionInference } from './use-vision-inference'

/** Accepts explicit image support from either provider catalogs or model-bank metadata. */
export function modelDeclaresImageInput(model?: Pick<ModelInfo, 'inputModalities' | 'metadata'>) {
  return model?.metadata?.abilities?.vision === true || model?.inputModalities?.includes('image') === true
}

/** The chat model that gets the images of a turn, and the vision model that can read them in its place. */
export interface ChatVisionSelection {
  chat: { provider: string, model: string }
  vision: { provider: string, model: string }
}

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
  const chatSession = useChatSessionStore()
  const cardStore = useAiriCardStore()
  const consciousnessStore = useConsciousnessStore()
  const providersStore = useProviderStore()
  const visionStore = useVisionStore()
  const { runVisionInference } = useVisionInference()

  /**
   * Returns the chat and vision selection of a session.
   *
   * A session with a character uses the modules of that character, the same source as the turn.
   * These calls use the selection of the module stores: a call without a session, and a session whose character
   * this device does not have. A direct ingest runs for such a session with the provider that its caller resolved.
   * `chatModel` replaces the chat model when the caller already resolved the model of the request.
   */
  function selectionOf(sessionId: string | undefined, chatModel?: string): ChatVisionSelection {
    const characterId = sessionId ? chatSession.characterMembersOf(sessionId)[0] : undefined
    if (!characterId || !cardStore.getCard(characterId)) {
      return {
        chat: { provider: consciousnessStore.activeProvider, model: chatModel ?? consciousnessStore.activeModel },
        vision: { provider: visionStore.activeProvider, model: visionStore.activeModel },
      }
    }

    const modules = cardStore.getModules(characterId)
    return {
      chat: { provider: modules.consciousness.provider, model: chatModel ?? modules.consciousness.model },
      vision: modules.vision,
    }
  }

  /** Whether the catalog of the chat provider declares image input for the model. Most catalogs omit it. */
  function declaresImageInput(chat: ChatVisionSelection['chat']) {
    const model = providersStore.getModelsForProvider(chat.provider).find(candidate => candidate.id === chat.model)
    return modelDeclaresImageInput(model)
  }

  function needsVisionModel(selection: ChatVisionSelection) {
    return !declaresImageInput(selection.chat) && visionStore.enabled && !!selection.vision.provider && !!selection.vision.model
  }

  /** Whether the vision model reads the images that the user attaches. */
  function readsAttachedImages(selection: ChatVisionSelection) {
    return needsVisionModel(selection) && visionStore.useForChat
  }

  /**
   * Returns the reader of tool images for this chat model, or `undefined` when
   * the chat model gets the images itself.
   */
  function toolImageReader(selection: ChatVisionSelection, abortSignal?: AbortSignal): DescribeToolImage | undefined {
    if (!needsVisionModel(selection) || !visionStore.useForToolImages)
      return undefined

    return imageDataUrl => runVisionInference({ imageDataUrl, workloadId: 'tool:image', abortSignal, selection: selection.vision })
  }

  return {
    selectionOf,
    readsAttachedImages,
    toolImageReader,
  }
}
