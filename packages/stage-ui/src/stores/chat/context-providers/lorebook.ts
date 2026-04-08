import type { ContextMessage } from '../../../types/chat'
import type { LorebookEntry } from '../../character/lorebook'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const LOREBOOK_CONTEXT_ID = 'system:lorebook'

export function createLorebookContext(matchedEntries: LorebookEntry[]): ContextMessage | undefined {
  if (!matchedEntries.length)
    return undefined

  const text = matchedEntries
    .map(entry => entry.content)
    .join('\n\n')

  return {
    id: nanoid(),
    contextId: LOREBOOK_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: `[Lorebook — relevant background knowledge]\n${text}`,
    createdAt: Date.now(),
    metadata: {
      source: {
        id: LOREBOOK_CONTEXT_ID,
        kind: 'plugin',
        plugin: {
          id: 'airi:system:lorebook',
        },
      },
    },
  }
}
