import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

const RECIPE_TRIGGER_CONTEXT_ID = 'system:airi-recipe-trigger'

/** Marks the recipes whose keyword trigger appears in this message. */
export function createRecipeTriggerContext(names: readonly string[]): ContextMessage {
  return {
    id: nanoid(),
    contextId: RECIPE_TRIGGER_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: {
      source: { id: RECIPE_TRIGGER_CONTEXT_ID },
    },
    text: `This message matches the trigger of these recipes: ${names.join(', ')}.`,
    createdAt: Date.now(),
  }
}
