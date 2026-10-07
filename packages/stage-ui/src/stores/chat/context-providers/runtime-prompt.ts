import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

export const RUNTIME_PROMPT_CONTEXT_ID = 'system:airi-runtime-prompt'
// Bilingual instructions need their own ReplaceSelf bucket: reusing the
// runtime prompt id would overwrite the ACT/emoji instructions for the turn.
export const BILINGUAL_PROMPT_CONTEXT_ID = 'system:bilingual-subtitles'

/**
 * Creates a user-role ReplaceSelf context for a runtime prompt. Pass a
 * distinct `contextId` so separate prompts replace only their own bucket.
 */
export function createRuntimePromptContext(prompt: string, contextId: string = RUNTIME_PROMPT_CONTEXT_ID): ContextMessage | undefined {
  if (!prompt)
    return undefined

  return {
    id: nanoid(),
    contextId,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: {
      source: { id: contextId },
    },
    text: prompt,
    createdAt: Date.now(),
  }
}
