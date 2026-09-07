import type { Event } from '@xsai/shared-chat'

import type { StreamEvent } from '../types/llm'

/**
 * Maps xsAI stream events onto the AIRI {@link StreamEvent} contract.
 *
 * xsAI 0.5.0-beta.8 marks failed tool executions with `isError: true` on
 * `tool-result.done` instead of aborting the stream, so AIRI can distinguish
 * `tool-error` from `tool-result` directly from the event payload.
 */
export function toAiriStreamEvent(event: Event): StreamEvent | null {
  switch (event.type) {
    case 'text.delta':
      return { type: 'text-delta', text: event.delta }
    case 'reasoning.delta':
      return { type: 'reasoning-delta', text: event.delta }
    case 'tool-call.done':
      return { ...event, type: 'tool-call' }
    case 'tool-result.done':
      if (event.isError === true)
        return { type: 'tool-error', toolCallId: event.toolCallId, result: typeof event.result === 'string' ? event.result : JSON.stringify(event.result), isError: true }
      return {
        type: 'tool-result',
        toolCallId: event.toolCallId,
        result: typeof event.result === 'string' || Array.isArray(event.result)
          ? event.result
          : JSON.stringify(event.result),
      }
    case 'error':
      return {
        type: 'error',
        error: event.cause ?? new Error(event.message),
      }
    case 'text.start':
    case 'text.done':
    case 'reasoning.start':
    case 'reasoning.done':
    case 'step.start':
    case 'step.done':
    case 'tool-call.start':
    case 'tool-call.delta':
      return null
  }
}
