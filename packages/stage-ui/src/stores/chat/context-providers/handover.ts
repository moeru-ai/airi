import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const HANDOVER_CONTEXT_ID = 'system:airi-handover'

/** Creates the replacing slot that tells a handover persona what the main conversation said last. It is context, never copied history. */
export function createHandoverContext(text: string): ContextMessage {
  return {
    id: nanoid(),
    contextId: HANDOVER_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: {
      source: { id: HANDOVER_CONTEXT_ID },
    },
    text,
    createdAt: Date.now(),
  }
}
