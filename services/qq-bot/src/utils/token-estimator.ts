import type { OpenAIMessage } from '../types/context'

import { encode } from 'gpt-tokenizer'

const MESSAGE_OVERHEAD_TOKENS = 4

/**
 * Estimate token usage for OpenAI-style chat messages locally.
 */
export function estimateTokens(messages: OpenAIMessage[]): number {
  return messages.reduce((total, message) => {
    const roleTokens = encode(message.role).length
    const contentTokens = encode(message.content).length
    return total + MESSAGE_OVERHEAD_TOKENS + roleTokens + contentTokens
  }, 0)
}
