import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const BILINGUAL_PROMPT_CONTEXT_ID = 'system:bilingual-subtitles'

/**
 * Creates the bilingual instruction as its own ReplaceSelf context.
 *
 * It must not reuse the `system:airi-runtime-prompt` bucket: ReplaceSelf keys
 * on the context id, so a shared id would overwrite the ACT, delay, and
 * emoji instructions with the bilingual text for the whole turn. Its own
 * context id keeps both instructions active at once. Returns undefined for
 * empty instructions so the caller can skip the ingest.
 */
export function createBilingualPromptContext(prompt: string): ContextMessage | undefined {
  if (!prompt)
    return undefined

  return {
    id: nanoid(),
    contextId: BILINGUAL_PROMPT_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: {
      source: { id: BILINGUAL_PROMPT_CONTEXT_ID },
    },
    text: prompt,
    createdAt: Date.now(),
  }
}
