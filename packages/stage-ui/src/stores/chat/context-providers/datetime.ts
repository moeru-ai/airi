import type { ContextMessage } from '../../../types/chat'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'

const DATETIME_CONTEXT_ID = 'system:datetime'

/**
 * Quantize a Date to the start of its minute so the text stays stable
 * across calls within the same minute, improving LLM KV-cache hit rates.
 * See: https://github.com/moeru-ai/airi/issues/1539
 */
function quantizeToMinute(date: Date): Date {
  const quantized = new Date(date)
  quantized.setSeconds(0, 0)
  return quantized
}

/**
 * Creates a context message containing the current datetime information.
 * This context is injected before each chat message to provide temporal awareness.
 *
 * Uses a fixed ID and minute-level quantization to maximise LLM KV-cache reuse.
 */
export function createDatetimeContext(): ContextMessage {
  const now = quantizeToMinute(new Date())

  return {
    id: `${DATETIME_CONTEXT_ID}:singleton`,
    contextId: DATETIME_CONTEXT_ID,
    strategy: ContextUpdateStrategy.ReplaceSelf,
    text: `Current datetime: ${now.toISOString()}`,
    createdAt: now.getTime(),
    metadata: {
      source: {
        id: DATETIME_CONTEXT_ID,
        kind: 'plugin',
        plugin: {
          id: 'airi:system:datetime',
        },
      },
    },
  }
}
