import type { AiriRuntimeRuleSet } from '../../../constants/prompts/emotion-rules'
import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

import { formatAiriRuntimeRuleSet } from '../../../constants/prompts/emotion-rules'

const AIRI_RUNTIME_RULES_CONTEXT_ID = 'system:airi-runtime-rules'

/**
 * Creates the per-turn stage rule context without modifying a character card
 * or the persisted system prompt.
 */
export function createAiriRuntimeRulesContext(ruleSet: AiriRuntimeRuleSet): ContextMessage {
  return {
    id: nanoid(),
    contextId: AIRI_RUNTIME_RULES_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    metadata: {
      source: { id: AIRI_RUNTIME_RULES_CONTEXT_ID },
    },
    text: formatAiriRuntimeRuleSet(ruleSet),
    createdAt: Date.now(),
  }
}
