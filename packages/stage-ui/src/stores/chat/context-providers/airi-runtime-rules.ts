import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { nanoid } from 'nanoid'

export interface AiriRuntimeRuleSet {
  /** Stage-control instructions that drive the active emotion and action state. */
  emotion: string
  /** Output characters that cannot reach the speech pipeline safely. */
  emoji: string
}

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
    text: [ruleSet.emotion, ruleSet.emoji]
      .filter(rule => rule.trim().length > 0)
      .join('\n\n'),
    createdAt: Date.now(),
  }
}
