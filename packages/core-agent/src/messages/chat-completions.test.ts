import { expect, it } from 'vitest'

import { conversationToChatMessages } from './chat-completions'

// https://github.com/moeru-ai/airi/pull/2477
it('preserves nested provider extensions on native Chat replay', () => {
  // ROOT CAUSE:
  // Partial object schemas stripped fields inside tool calls and refusal parts.
  // Native replay now retains the SDK payload within its owning scope.
  const native = [{
    role: 'assistant' as const,
    content: [{ type: 'refusal' as const, refusal: 'Cannot comply', provider_details: { code: 'custom' } }],
    tool_calls: [{ type: 'function' as const, id: 'call', provider_id: 'opaque', function: { name: 'lookup', arguments: '{}', provider_state: 'keep' } }],
  }]
  const result = conversationToChatMessages({ turns: [{ type: 'assistant', id: 'turn', status: 'completed', rounds: [{ id: 'round', content: [], toolInvocations: [], projectionIssues: [], continuation: { protocol: 'chat-completions', scope: 'owner', data: native } }] }] }, true, 'owner')
  expect(result).toEqual(native)
  expect(native[0].tool_calls[0].function.provider_state).toBe('keep')
})
