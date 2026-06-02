import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

export const MEMORY_RECALL_CONTEXT_ID = 'memory:recall'

/**
 * Builds the long-term-memory recall context update for a turn.
 *
 * Always `ReplaceSelf` under a dedicated `memory:recall` source bucket (distinct from other runtime
 * contexts), so an empty `text` clears the previous turn's memory line — `formatContextPromptText`
 * skips blank-text messages. The metadata source only resolves the bucket key; it is not serialized
 * into the prompt.
 *
 * @param text - The formatted `[Memory]` block, or '' to clear it when nothing was recalled.
 */
export function buildMemoryRecallContext(text: string): ContextMessage {
  return {
    id: nanoid(),
    contextId: MEMORY_RECALL_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text,
    createdAt: Date.now(),
    metadata: {
      source: {
        id: MEMORY_RECALL_CONTEXT_ID,
        kind: 'plugin' as const,
        plugin: { id: 'memory' },
      },
    },
  }
}
