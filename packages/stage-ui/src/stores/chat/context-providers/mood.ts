import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const MOOD_CONTEXT_ID = 'system:airi-mood'

/** Creates the replacing mood slot, so the conversation's tone can follow the persona's mood. */
export function createMoodContext(text: string): ContextMessage {
  return {
    id: nanoid(),
    contextId: MOOD_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: {
      source: { id: MOOD_CONTEXT_ID },
    },
    text,
    createdAt: Date.now(),
  }
}
