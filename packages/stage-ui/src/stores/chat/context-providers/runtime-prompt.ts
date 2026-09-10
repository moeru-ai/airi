import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

/**
 * Context the runtime prompt is stored under.
 *
 * Exported because a prompt that has nothing to say has to be dropped from the
 * snapshot by the consumer: returning `undefined` from the provider leaves the
 * previous ingest in the registry instead of clearing it.
 */
export const RUNTIME_PROMPT_CONTEXT_ID = 'system:airi-runtime-prompt'

/** Creates a user-role context for the current runtime prompt. */
export function createRuntimePromptContext(prompt: string): ContextMessage | undefined {
  if (!prompt)
    return undefined

  return {
    id: nanoid(),
    contextId: RUNTIME_PROMPT_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: {
      source: { id: RUNTIME_PROMPT_CONTEXT_ID },
    },
    text: prompt,
    createdAt: Date.now(),
  }
}
