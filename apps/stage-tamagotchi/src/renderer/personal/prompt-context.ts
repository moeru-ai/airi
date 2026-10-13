import type { ContextMessage } from '@proj-airi/stage-ui/types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { useChatContextStore } from '@proj-airi/stage-ui/stores/chat/context-store'
import { nanoid } from 'nanoid'

/**
 * Replaces the text of one prompt context bucket in this window.
 *
 * The chat runtime adds every bucket to the next prompt. A bucket keeps its
 * last text until a new text replaces it, so callers must also write a text
 * when they have nothing to add. Otherwise old text stays in the prompt.
 */
export function replacePromptContext(contextId: string, text: string) {
  const envelope: ContextMessage = {
    id: nanoid(),
    contextId,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: { source: { id: contextId } },
    text,
    createdAt: Date.now(),
  }
  useChatContextStore().ingestContextMessage(envelope)
}
